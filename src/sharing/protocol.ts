import type { PlayerFix, SquadPosition } from "../types";

export const SIGNAL_ORIGIN = "https://signal.mouchsiadis-solutions.com";
export const PROTOCOL_VERSION = 1 as const;
export const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;
export const STALE_AFTER_MS = 60_000;
export const EVICT_AFTER_MS = 120_000;

interface Envelope { v: 1; nonce: string; ciphertext: string }
interface WirePosition {
  v: 1;
  senderId: string;
  sequence: number;
  nickname: string;
  mapId: string;
  x: number;
  y: number;
  z: number;
  heading: number | null;
  observedAt: number;
}

export interface RoomInvitation { roomId: string; rawKey: Uint8Array; url: string; webSocketUrl: string }

export function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid invitation encoding");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

export function createRoomId(now = Date.now()) {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  new DataView(bytes.buffer).setUint32(0, Math.floor(now / 1000), false);
  return base64Url(bytes);
}

export function roomCreatedAt(roomId: string) {
  const bytes = decodeBase64Url(roomId);
  if (bytes.length !== 20) throw new Error("Invalid room ID");
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false) * 1000;
}

export function validateRoomId(roomId: string, now = Date.now()) {
  const createdAt = roomCreatedAt(roomId);
  if (createdAt > now + 5 * 60_000) throw new Error("Room invitation is not active yet");
  if (now - createdAt >= ROOM_LIFETIME_MS) throw new Error("Room invitation has expired");
  return createdAt;
}

export function createInvitation(origin = SIGNAL_ORIGIN, now = Date.now()): RoomInvitation {
  const roomId = createRoomId(now);
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const base = new URL(origin);
  const httpProtocol = base.protocol === "http:" ? "http:" : "https:";
  const wsProtocol = httpProtocol === "https:" ? "wss:" : "ws:";
  const url = `${httpProtocol}//${base.host}/room/${roomId}#${base64Url(rawKey)}`;
  return { roomId, rawKey, url, webSocketUrl: `${wsProtocol}//${base.host}/v1/rooms/${roomId}` };
}

export function parseInvitation(value: string): RoomInvitation {
  const invitation = new URL(value.trim());
  if (!/^https?:$/.test(invitation.protocol)) throw new Error("Invitation must use HTTPS");
  const match = invitation.pathname.match(/^\/room\/([A-Za-z0-9_-]{27})\/?$/);
  if (!match) throw new Error("Invalid room invitation");
  const roomId = match[1];
  validateRoomId(roomId);
  const rawKey = decodeBase64Url(invitation.hash.slice(1));
  if (rawKey.length !== 32) throw new Error("Invitation key must be 256 bits");
  return {
    roomId,
    rawKey,
    url: invitation.toString(),
    webSocketUrl: `${invitation.protocol === "https:" ? "wss:" : "ws:"}//${invitation.host}/v1/rooms/${roomId}`,
  };
}

function aad(roomId: string) {
  return new TextEncoder().encode(`raid-signal:v${PROTOCOL_VERSION}:${roomId}`);
}

export async function importRoomKey(rawKey: Uint8Array, usage: KeyUsage[] = ["encrypt", "decrypt"]) {
  return crypto.subtle.importKey("raw", Uint8Array.from(rawKey).buffer, "AES-GCM", false, usage);
}

export function positionPayload(senderId: string, sequence: number, nickname: string, mapId: string, fix: PlayerFix): WirePosition {
  const heading = fix.forward ? (Math.atan2(fix.forward.x, fix.forward.z) * 180 / Math.PI + 360) % 360 : null;
  return {
    v: 1,
    senderId,
    sequence,
    nickname: nickname.trim().slice(0, 24) || "PLAYER",
    mapId,
    x: fix.position.x,
    y: fix.position.y,
    z: fix.position.z,
    heading,
    observedAt: fix.observedAt,
  };
}

export async function encryptPosition(key: CryptoKey, roomId: string, payload: WirePosition) {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(roomId), tagLength: 128 }, key, plaintext);
  return JSON.stringify({ v: 1, nonce: base64Url(nonce), ciphertext: base64Url(new Uint8Array(ciphertext)) } satisfies Envelope);
}

function validWirePosition(value: unknown): value is WirePosition {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.v === 1
    && typeof item.senderId === "string" && /^[0-9a-f-]{36}$/i.test(item.senderId)
    && Number.isSafeInteger(item.sequence) && Number(item.sequence) > 0
    && typeof item.nickname === "string" && item.nickname.length > 0 && item.nickname.length <= 24
    && typeof item.mapId === "string" && /^[a-z0-9-]{2,32}$/.test(item.mapId)
    && [item.x, item.y, item.z, item.observedAt].every((entry) => typeof entry === "number" && Number.isFinite(entry))
    && (item.heading === null || (typeof item.heading === "number" && Number.isFinite(item.heading) && item.heading >= 0 && item.heading < 360));
}

export async function decryptPosition(key: CryptoKey, roomId: string, message: string | ArrayBuffer, now = Date.now()): Promise<SquadPosition> {
  const source = typeof message === "string" ? message : new TextDecoder().decode(message);
  const envelope = JSON.parse(source) as Partial<Envelope>;
  if (envelope.v !== 1 || typeof envelope.nonce !== "string" || typeof envelope.ciphertext !== "string") throw new Error("Invalid encrypted envelope");
  const nonce = decodeBase64Url(envelope.nonce);
  if (nonce.length !== 12) throw new Error("Invalid AES-GCM nonce");
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce, additionalData: aad(roomId), tagLength: 128 }, key, decodeBase64Url(envelope.ciphertext));
  const payload: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!validWirePosition(payload)) throw new Error("Invalid position payload");
  if (payload.observedAt > now + 30_000 || payload.observedAt < now - ROOM_LIFETIME_MS) throw new Error("Position timestamp is outside the room window");
  return {
    senderId: payload.senderId,
    sequence: payload.sequence,
    nickname: payload.nickname,
    mapId: payload.mapId,
    position: { x: payload.x, y: payload.y, z: payload.z },
    heading: payload.heading,
    observedAt: payload.observedAt,
    receivedAt: now,
  };
}
