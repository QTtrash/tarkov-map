import { invoke } from "@tauri-apps/api/core";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isTauriRuntime } from "../locator";
import {
  createInvitation,
  createLanInvitation,
  createSenderId,
  decryptPosition,
  encryptPosition,
  importRoomKey,
  parseInvitation,
  positionPayload,
  SIGNAL_ORIGIN,
  type RoomCipher,
  type RoomInvitation,
} from "../sharing/protocol";
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

type Connection = "off" | "encrypting" | "connecting" | "online" | "disconnected" | "error";
const CONNECTION_TIMEOUT_MS = 10_000;

export function SharePanel({ open, fix, mapId, onClose, onSquadPosition, onSessionEnd }: SharePanelProps) {
  const [mode, setMode] = useState<"internet" | "lan">("internet");
  const [invite, setInvite] = useState("");
  const [joinInvite, setJoinInvite] = useState("");
  const [connection, setConnection] = useState<Connection>("off");
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("PLAYER");
  const socketRef = useRef<WebSocket | null>(null);
  const keyRef = useRef<RoomCipher | null>(null);
  const roomRef = useRef("");
  const latestRef = useRef<{ fix: PlayerFix; mapId: string } | null>(null);
  const sequenceRef = useRef(0);
  const senderRef = useRef(createSenderId());
  const highestSequenceRef = useRef(new Map<string, number>());
  const timeoutRef = useRef<number | null>(null);
  const hostingLanRef = useRef(false);

  useEffect(() => {
    latestRef.current = fix ? { fix, mapId: fix.mapId ?? mapId } : null;
  }, [fix, mapId]);

  const clearConnectionTimeout = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
  }, []);

  const sendLatest = useCallback(async () => {
    const socket = socketRef.current;
    const key = keyRef.current;
    const latest = latestRef.current;
    if (!latest || !key || !roomRef.current || socket?.readyState !== WebSocket.OPEN) return;
    sequenceRef.current += 1;
    const message = await encryptPosition(key, roomRef.current, positionPayload(senderRef.current, sequenceRef.current, nickname, latest.mapId, latest.fix));
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
  }, [nickname]);

  const connectRoom = useCallback(async (room: RoomInvitation, socketUrl = room.webSocketUrl) => {
    setConnection("encrypting");
    keyRef.current = await importRoomKey(room.rawKey);
    roomRef.current = room.roomId;
    sequenceRef.current = 0;
    highestSequenceRef.current.clear();
    setConnection("connecting");
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;
    socket.binaryType = "arraybuffer";
    clearConnectionTimeout();
    timeoutRef.current = window.setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING) {
        socket.close();
        setConnection("error");
        setError(room.transport === "lan"
          ? "The LAN host did not respond. Check that both PCs are on the same network and allow Raid Signal through Windows Firewall."
          : "The encrypted Internet room did not respond.");
      }
    }, CONNECTION_TIMEOUT_MS);
    socket.onopen = () => {
      clearConnectionTimeout();
      setConnection("online");
      void sendLatest();
    };
    socket.onerror = () => {
      clearConnectionTimeout();
      setConnection("error");
      setError(room.transport === "lan"
        ? "Could not connect to the encrypted LAN session"
        : "Could not connect to the encrypted Internet room");
    };
    socket.onclose = (event) => {
      clearConnectionTimeout();
      if (socketRef.current !== socket) return;
      socketRef.current = null;
      if (event.code === 1000) setConnection("off");
      else {
        setConnection("disconnected");
        setError(event.reason || (room.transport === "lan" ? "The LAN host ended the session" : "The relay disconnected"));
      }
    };
    socket.onmessage = (event) => {
      const key = keyRef.current;
      if (!key) return;
      void decryptPosition(key, room.roomId, event.data).then((position) => {
        if (position.senderId === senderRef.current) return;
        const highest = highestSequenceRef.current.get(position.senderId) ?? 0;
        if (position.sequence <= highest) return;
        highestSequenceRef.current.set(position.senderId, position.sequence);
        onSquadPosition(position);
      }).catch(() => undefined);
    };
  }, [clearConnectionTimeout, onSquadPosition, sendLatest]);

  async function hostInternet() {
    try {
      setError(null);
      const invitation = createInvitation(SIGNAL_ORIGIN);
      setInvite(invitation.url);
      await connectRoom(invitation);
    } catch (reason) {
      setConnection("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function joinRoom(expectedTransport: "internet" | "lan") {
    try {
      setError(null);
      const parsed = parseInvitation(joinInvite);
      if (parsed.transport !== expectedTransport) throw new Error(expectedTransport === "lan" ? "Paste a same-Wi-Fi / LAN invitation" : "Paste an Internet room invitation");
      setInvite(parsed.url);
      await connectRoom(parsed);
    } catch (reason) {
      setConnection("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function startLan() {
    try {
      setError(null);
      if (!isTauriRuntime()) throw new Error("LAN sharing requires the desktop app");
      setConnection("connecting");
      const info = await invoke<ShareInfo>("start_lan_share");
      hostingLanRef.current = true;
      const invitation = createLanInvitation(info.phoneUrl);
      setInvite(invitation.url);
      await connectRoom(invitation, info.webSocketUrl);
    } catch (reason) {
      if (hostingLanRef.current && isTauriRuntime()) await invoke("stop_lan_share").catch(() => undefined);
      hostingLanRef.current = false;
      setConnection("error");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  }

  async function stop() {
    clearConnectionTimeout();
    const socket = socketRef.current;
    socketRef.current = null;
    socket?.close(1000, "Session ended");
    keyRef.current = null;
    roomRef.current = "";
    sequenceRef.current = 0;
    highestSequenceRef.current.clear();
    setInvite("");
    setJoinInvite("");
    setError(null);
    setConnection("off");
    onSessionEnd();
    if (hostingLanRef.current && isTauriRuntime()) await invoke("stop_lan_share");
    hostingLanRef.current = false;
  }

  useEffect(() => () => {
    clearConnectionTimeout();
    socketRef.current?.close();
  }, [clearConnectionTimeout]);
  useEffect(() => { if (connection === "online") void sendLatest(); }, [fix, mapId, connection, sendLatest]);
  useEffect(() => {
    if (connection !== "online") return;
    const timer = window.setInterval(() => void sendLatest(), 15_000);
    return () => window.clearInterval(timer);
  }, [connection, sendLatest]);

  if (!open) return null;
  const active = ["encrypting", "connecting", "online"].includes(connection);
  const stateLabel = connection === "encrypting" ? "ENCRYPTING" : connection.toUpperCase();
  const joinLabel = mode === "internet" ? "INTERNET INVITATION URL" : "LAN INVITATION URL";
  const joinPlaceholder = mode === "internet" ? "https://signal…/room/…#key" : "http://192.168…/lan/…#key";
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="kicker">PRIVATE SQUAD COORDINATION</span><h2 id="share-title">Phone & squad link</h2></div><button className="bare-icon" onClick={onClose} aria-label="Close sharing"><UiIcon name="close" /></button></header>
    <div className="dialog-section">
      <div className="segmented"><button className={mode === "internet" ? "active" : ""} onClick={() => { setMode("internet"); setError(null); }} disabled={active}>INTERNET</button><button className={mode === "lan" ? "active" : ""} onClick={() => { setMode("lan"); setError(null); }} disabled={active}>SAME WI-FI / LAN</button></div>
      <label className="text-field"><span>CALLSIGN</span><input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} /></label>
      {mode === "internet" ? <><h3>INTERNET ROOM</h3><p>Positions are encrypted before leaving this device. The relay sees connection metadata and room activity, but cannot decrypt the map or coordinates.</p></> : <><h3>ENCRYPTED LAN SESSION</h3><p>One desktop hosts the temporary session. Other desktops and phones must be on the same trusted network; the link never reaches the Internet relay.</p></>}
      {!active && !invite && <div className="share-actions">
        <button className="dialog-button" onClick={() => void (mode === "internet" ? hostInternet() : startLan())}>{mode === "internet" ? "CREATE INTERNET ROOM" : "HOST LAN SESSION"}</button>
        <span>OR JOIN AND PUBLISH YOUR POSITION</span>
        <label className="text-field"><span>{joinLabel}</span><input value={joinInvite} onChange={(event) => setJoinInvite(event.target.value)} placeholder={joinPlaceholder} /></label>
        <button className="dialog-button secondary" disabled={!joinInvite.trim()} onClick={() => void joinRoom(mode)}>JOIN AND PUBLISH</button>
      </div>}
      {(invite || active) && <div className="pairing-grid">{invite && <div className="qr-plate"><QRCodeSVG value={invite} size={176} bgColor="#f1eee4" fgColor="#111411" /></div>}<div><span className={`share-state ${connection}`}>{stateLabel}</span><strong>{mode === "internet" ? "Share privately with your squad" : "Scan on a phone or paste into another desktop"}</strong><p>The invitation contains the encryption key. Anyone who has it can view the live positions, and a modified client could publish forged positions.</p>{mode === "lan" && <p>LAN traffic is encrypted, but the page itself uses local HTTP. Use this only on a network you trust.</p>}{invite && <button className="inline-action" onClick={() => void navigator.clipboard.writeText(invite)}>COPY INVITATION</button>}<button className="inline-action danger" onClick={() => void stop()}>END SESSION</button></div></div>}
      {error && <p className="error-box">{error}</p>}
    </div>
    <footer className="share-privacy">8 clients · {mode === "internet" ? "3 hours" : "until the host ends it"} · no message history · screenshots, logs, account data, quests and pins are never relayed</footer>
  </section></div>;
}
