import { invoke } from "@tauri-apps/api/core";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauriRuntime } from "../locator";
import { createInvitation, decryptPosition, encryptPosition, importRoomKey, parseInvitation, positionPayload, SIGNAL_ORIGIN } from "../sharing/protocol";
import type { PlayerFix, SquadPosition } from "../types";
import { UiIcon } from "./Icons";

interface ShareInfo { phoneUrl: string; webSocketUrl: string }
interface SharePanelProps {
  open: boolean;
  fix: PlayerFix | null;
  mapId: string;
  onClose: () => void;
  onSquadPosition: (position: SquadPosition) => void;
  onSessionEnd: () => void;
}

type Connection = "off" | "connecting" | "online" | "error";

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function SharePanel({ open, fix, mapId, onClose, onSquadPosition, onSessionEnd }: SharePanelProps) {
  const [mode, setMode] = useState<"internet" | "lan">("internet");
  const [lanInfo, setLanInfo] = useState<ShareInfo | null>(null);
  const [invite, setInvite] = useState("");
  const [joinInvite, setJoinInvite] = useState("");
  const [connection, setConnection] = useState<Connection>("off");
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("PLAYER");
  const socketRef = useRef<WebSocket | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const roomRef = useRef("");
  const latestRef = useRef<{ fix: PlayerFix; mapId: string } | null>(null);
  const sequenceRef = useRef(0);
  const senderRef = useRef(crypto.randomUUID());
  const highestSequenceRef = useRef(new Map<string, number>());

  useEffect(() => { latestRef.current = fix ? { fix, mapId } : null; }, [fix, mapId]);

  const sendLatest = useCallback(async () => {
    const socket = socketRef.current;
    const key = keyRef.current;
    const latest = latestRef.current;
    if (!latest || !key || !roomRef.current || socket?.readyState !== WebSocket.OPEN) return;
    sequenceRef.current += 1;
    const message = await encryptPosition(key, roomRef.current, positionPayload(senderRef.current, sequenceRef.current, nickname, latest.mapId, latest.fix));
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }, [nickname]);

  const connectInternet = useCallback(async (invitationUrl: string, rawKey?: Uint8Array, roomId?: string, webSocketUrl?: string) => {
    const room = rawKey && roomId && webSocketUrl ? { rawKey, roomId, webSocketUrl } : parseInvitation(invitationUrl);
    keyRef.current = await importRoomKey(room.rawKey);
    roomRef.current = room.roomId;
    highestSequenceRef.current.clear();
    const socket = new WebSocket(room.webSocketUrl);
    socketRef.current = socket;
    socket.binaryType = "arraybuffer";
    socket.onopen = () => { setConnection("online"); void sendLatest(); };
    socket.onerror = () => { setConnection("error"); setError("Could not connect to the encrypted Internet room"); };
    socket.onclose = (event) => {
      if (socketRef.current === socket) setConnection("off");
      if (event.code === 1008 || event.code === 1009 || event.code === 1013) setError(event.reason || "The relay ended this connection");
    };
    socket.onmessage = (event) => {
      void decryptPosition(keyRef.current!, room.roomId, event.data).then((position) => {
        if (position.senderId === senderRef.current) return;
        const highest = highestSequenceRef.current.get(position.senderId) ?? 0;
        if (position.sequence <= highest) return;
        highestSequenceRef.current.set(position.senderId, position.sequence);
        onSquadPosition(position);
      }).catch(() => undefined);
    };
  }, [onSquadPosition, sendLatest]);

  async function hostInternet() {
    try {
      setError(null);
      setConnection("connecting");
      const invitation = createInvitation(SIGNAL_ORIGIN);
      setInvite(invitation.url);
      await connectInternet(invitation.url, invitation.rawKey, invitation.roomId, invitation.webSocketUrl);
    } catch (reason) {
      setConnection("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function joinInternet() {
    try {
      setError(null);
      setConnection("connecting");
      const parsed = parseInvitation(joinInvite);
      setInvite(parsed.url);
      await connectInternet(parsed.url);
    } catch (reason) {
      setConnection("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function startLan() {
    try {
      setError(null);
      setConnection("connecting");
      if (!isTauriRuntime()) throw new Error("LAN sharing requires the desktop app");
      const nextInfo = await invoke<ShareInfo>("start_lan_share");
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      keyRef.current = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
      setInvite(`${nextInfo.phoneUrl}#${base64Url(rawKey)}`);
      setLanInfo(nextInfo);
      const socket = new WebSocket(nextInfo.webSocketUrl);
      socketRef.current = socket;
      socket.onopen = () => setConnection("online");
      socket.onerror = () => { setConnection("error"); setError("Could not open the local encrypted link"); };
      socket.onclose = () => setConnection("off");
    } catch (reason) {
      setConnection("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function stop() {
    socketRef.current?.close(1000, "Session ended");
    socketRef.current = null;
    keyRef.current = null;
    roomRef.current = "";
    highestSequenceRef.current.clear();
    setLanInfo(null);
    setInvite("");
    setConnection("off");
    onSessionEnd();
    if (isTauriRuntime()) await invoke("stop_lan_share");
  }

  useEffect(() => () => { socketRef.current?.close(); }, []);
  useEffect(() => { if (mode === "internet") void sendLatest(); }, [fix, mapId, mode, sendLatest]);
  useEffect(() => {
    if (mode !== "internet" || connection !== "online") return;
    const timer = window.setInterval(() => void sendLatest(), 15_000);
    return () => window.clearInterval(timer);
  }, [connection, mode, sendLatest]);

  useEffect(() => {
    if (mode !== "lan") return;
    const socket = socketRef.current;
    const key = keyRef.current;
    if (!fix || !key || socket?.readyState !== WebSocket.OPEN) return;
    const heading = fix.forward ? (Math.atan2(fix.forward.x, fix.forward.z) * 180 / Math.PI + 360) % 360 : null;
    const payload = new TextEncoder().encode(JSON.stringify({ v: 1, senderId: senderRef.current, nickname: nickname.trim().slice(0, 24) || "PLAYER", mapId, x: fix.position.x, y: fix.position.y, z: fix.position.z, heading, observedAt: fix.observedAt }));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    void crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, payload).then((ciphertext) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: 1, nonce: base64Url(nonce), ciphertext: base64Url(new Uint8Array(ciphertext)) }));
    });
  }, [fix, mapId, mode, nickname]);

  if (!open) return null;
  const active = connection === "connecting" || connection === "online";
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="kicker">END-TO-END ENCRYPTED COORDINATION</span><h2 id="share-title">Phone & squad link</h2></div><button className="bare-icon" onClick={onClose} aria-label="Close sharing"><UiIcon name="close" /></button></header>
    <div className="dialog-section">
      <div className="segmented"><button className={mode === "internet" ? "active" : ""} onClick={() => setMode("internet")} disabled={active}>INTERNET</button><button className={mode === "lan" ? "active" : ""} onClick={() => setMode("lan")} disabled={active}>SAME WI-FI / LAN</button></div>
      <label className="text-field"><span>CALLSIGN</span><input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} /></label>
      {mode === "internet" ? <>
        <h3>INTERNET ROOM</h3><p>Positions are encrypted before leaving this device. The relay sees connection metadata and room activity, but cannot decrypt the map or coordinates.</p>
        {!active && !invite && <div className="share-actions"><button className="dialog-button" onClick={() => void hostInternet()}>CREATE INTERNET ROOM</button><span>OR JOIN AN EXISTING SQUAD</span><label className="text-field"><span>INVITATION URL</span><input value={joinInvite} onChange={(event) => setJoinInvite(event.target.value)} placeholder="https://signal…/room/…#key" /></label><button className="dialog-button secondary" disabled={!joinInvite.trim()} onClick={() => void joinInternet()}>JOIN AND PUBLISH</button></div>}
      </> : <><h3>ENCRYPTED LAN SESSION</h3><p>Your phone must be on the same network. The local link never reaches the Internet relay.</p>{!lanInfo && !active && <button className="dialog-button" onClick={() => void startLan()}>START LAN SESSION</button>}</>}
      {(invite || active) && <div className="pairing-grid">{invite && <div className="qr-plate"><QRCodeSVG value={invite} size={176} bgColor="#f1eee4" fgColor="#111411" /></div>}<div><span className={`share-state ${connection}`}>{connection.toUpperCase()}</span><strong>{mode === "internet" ? "Share privately with your squad" : "Scan with your phone camera"}</strong><p>The invitation contains the encryption key. Anyone who has it can join and a modified client could publish forged positions.</p>{invite && <button className="inline-action" onClick={() => void navigator.clipboard.writeText(invite)}>COPY INVITATION</button>}<button className="inline-action danger" onClick={() => void stop()}>END SESSION</button></div></div>}
      {error && <p className="error-box">{error}</p>}
    </div>
    <footer className="share-privacy">8 clients · 3 hours · no message history · screenshots, logs, account data, quests and pins are never relayed</footer>
  </section></div>;
}
