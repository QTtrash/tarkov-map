import { invoke } from "@tauri-apps/api/core";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useRef, useState } from "react";
import { isTauriRuntime } from "../locator";
import type { PlayerFix } from "../types";
import { UiIcon } from "./Icons";

interface ShareInfo { phoneUrl: string; webSocketUrl: string }
interface SharePanelProps { open: boolean; fix: PlayerFix | null; mapId: string; onClose: () => void }

function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function SharePanel({ open, fix, mapId, onClose }: SharePanelProps) {
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [invite, setInvite] = useState("");
  const [connection, setConnection] = useState<"off" | "connecting" | "online" | "error">("off");
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState("PLAYER");
  const socketRef = useRef<WebSocket | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const senderRef = useRef(crypto.randomUUID());

  async function start() {
    try {
      setError(null);
      setConnection("connecting");
      if (!isTauriRuntime()) throw new Error("LAN sharing requires the desktop app");
      const nextInfo = await invoke<ShareInfo>("start_lan_share");
      const rawKey = crypto.getRandomValues(new Uint8Array(32));
      keyRef.current = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["encrypt"]);
      setInvite(`${nextInfo.phoneUrl}#${base64Url(rawKey)}`);
      setInfo(nextInfo);
      const socket = new WebSocket(nextInfo.webSocketUrl);
      socketRef.current = socket;
      socket.onopen = () => setConnection("online");
      socket.onerror = () => { setConnection("error"); setError("Could not open the local encrypted link"); };
      socket.onclose = () => setConnection("off");
    } catch (reason) {
      setConnection("error");
      setError(String(reason));
    }
  }

  async function stop() {
    socketRef.current?.close();
    socketRef.current = null;
    keyRef.current = null;
    setInfo(null);
    setInvite("");
    setConnection("off");
    if (isTauriRuntime()) await invoke("stop_lan_share");
  }

  useEffect(() => () => { socketRef.current?.close(); }, []);
  useEffect(() => {
    const socket = socketRef.current;
    const key = keyRef.current;
    if (!fix || !key || socket?.readyState !== WebSocket.OPEN) return;
    const heading = fix.forward ? (Math.atan2(fix.forward.x, fix.forward.z) * 180 / Math.PI + 360) % 360 : null;
    const payload = new TextEncoder().encode(JSON.stringify({
      v: 1, senderId: senderRef.current, nickname: nickname.trim().slice(0, 24) || "PLAYER", mapId,
      x: fix.position.x, y: fix.position.y, z: fix.position.z, heading, observedAt: fix.observedAt,
    }));
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    void crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, payload).then((ciphertext) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ v: 1, nonce: base64Url(nonce), ciphertext: base64Url(new Uint8Array(ciphertext)) }));
    });
  }, [fix, mapId, nickname]);

  if (!open) return null;
  return <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}><section className="dialog share-dialog" role="dialog" aria-modal="true" aria-labelledby="share-title" onMouseDown={(event) => event.stopPropagation()}>
    <header><div><span className="kicker">LOCAL-FIRST COORDINATION</span><h2 id="share-title">Phone & squad link</h2></div><button className="bare-icon" onClick={onClose} aria-label="Close sharing"><UiIcon name="close" /></button></header>
    <div className="dialog-section"><h3>ENCRYPTED LAN SESSION</h3><p>Your phone must be on the same network. Position updates are encrypted in the browser; screenshots, paths, and logs are never sent.</p>
      <label className="text-field"><span>CALLSIGN</span><input value={nickname} maxLength={24} onChange={(event) => setNickname(event.target.value)} /></label>
      {!info ? <button className="dialog-button" onClick={() => void start()}>START PHONE SESSION</button> : <div className="pairing-grid"><div className="qr-plate"><QRCodeSVG value={invite} size={176} bgColor="#f1eee4" fgColor="#111411" /></div><div><span className={`share-state ${connection}`}>{connection.toUpperCase()}</span><strong>Scan with your phone camera</strong><p>The invitation contains the encryption key. Only share it with squadmates you trust.</p><button className="inline-action" onClick={() => void navigator.clipboard.writeText(invite)}>COPY INVITATION</button><button className="inline-action danger" onClick={() => void stop()}>END SESSION</button></div></div>}
      {error && <p className="error-box">{error}</p>}
    </div>
    <div className="dialog-section"><h3>INTERNET ROOMS</h3><p>The hosted relay is implemented in the repository but remains disabled until a production domain, privacy policy, rate limits, and deployment credentials are configured.</p><button className="dialog-button secondary" disabled>HOSTED RELAY NOT CONFIGURED</button></div>
  </section></div>;
}
