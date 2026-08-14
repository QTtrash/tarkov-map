import { gcm } from "@noble/ciphers/aes.js";
import type { PlayerFix, SquadPosition } from "../types";

export const SIGNAL_ORIGIN = "https://signal.mouchsiadis-solutions.com";
export const PROTOCOL_VERSION = 1 as const;
export const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;
export const STALE_AFTER_MS = 60_000;
export const EVICT_AFTER_MS = 120_000;

interface Envelope {
  v: 1;
  nonce: string;
  ciphertext: string;
}
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

export type RoomTransport = "internet" | "lan";

export interface RoomInvitation {
  transport: RoomTransport;
  roomId: string;
  rawKey: Uint8Array;
  url: string;
  webSocketUrl: string;
}

export type CipherBackend = "webcrypto" | "javascript";

export interface RoomCipher {
  backend: CipherBackend;
  encrypt: (nonce: Uint8Array, plaintext: Uint8Array, additionalData: Uint8Array) => Promise<Uint8Array>;
  decrypt: (nonce: Uint8Array, ciphertext: Uint8Array, additionalData: Uint8Array) => Promise<Uint8Array>;
}

export function base64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function decodeBase64Url(value: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid invitation encoding");
  const normalized = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

function secureRandom(length: number) {
  if (!globalThis.crypto?.getRandomValues) throw new Error("Secure randomness is unavailable in this browser");
  return crypto.getRandomValues(new Uint8Array(length));
}

export function createSenderId() {
  const bytes = secureRandom(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function createRoomId(now = Date.now()) {
  const bytes = secureRandom(20);
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

function invitation(origin: string, transport: RoomTransport, now: number): RoomInvitation {
  const roomId = createRoomId(now);
  const rawKey = secureRandom(32);
  const base = new URL(origin);
  if (!/^https?:$/.test(base.protocol)) throw new Error("Invitation origin must use HTTP or HTTPS");
  const httpProtocol = base.protocol === "https:" ? "https:" : "http:";
  const wsProtocol = httpProtocol === "https:" ? "wss:" : "ws:";
  const roomPath = transport === "internet" ? "room" : "lan";
  const wsPath = transport === "internet" ? `/v1/rooms/${roomId}` : "/ws";
  const url = `${httpProtocol}//${base.host}/${roomPath}/${roomId}#${base64Url(rawKey)}`;
  return { transport, roomId, rawKey, url, webSocketUrl: `${wsProtocol}//${base.host}${wsPath}` };
}

export function createInvitation(origin = SIGNAL_ORIGIN, now = Date.now()) {
  return invitation(origin, "internet", now);
}

export function createLanInvitation(origin: string, now = Date.now()) {
  return invitation(origin, "lan", now);
}

export function parseInvitation(value: string): RoomInvitation {
  const parsed = new URL(value.trim());
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("Invitation must use HTTP or HTTPS");
  const match = parsed.pathname.match(/^\/(room|lan)\/([A-Za-z0-9_-]{27})\/?$/);
  if (!match) throw new Error("Invalid room invitation");
  const transport: RoomTransport = match[1] === "lan" ? "lan" : "internet";
  if (transport === "internet" && parsed.protocol !== "https:") throw new Error("Internet invitations must use HTTPS");
  const roomId = match[2];
  if (transport === "internet") validateRoomId(roomId);
  else if (roomCreatedAt(roomId) > Date.now() + 5 * 60_000) throw new Error("LAN invitation is not active yet");
  const rawKey = decodeBase64Url(parsed.hash.slice(1));
  if (rawKey.length !== 32) throw new Error("Invitation key must be 256 bits");
  const wsProtocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return {
    transport,
    roomId,
    rawKey,
    url: parsed.toString(),
    webSocketUrl:
      transport === "internet"
        ? `${wsProtocol}//${parsed.host}/v1/rooms/${roomId}`
        : `${wsProtocol}//${parsed.host}/ws`,
  };
}

function aad(roomId: string) {
  return new TextEncoder().encode(`raid-signal:v${PROTOCOL_VERSION}:${roomId}`);
}

export async function importRoomKey(
  rawKey: Uint8Array,
  usage: KeyUsage[] = ["encrypt", "decrypt"],
  forceBackend?: CipherBackend,
): Promise<RoomCipher> {
  if (rawKey.length !== 32) throw new Error("Room key must be 256 bits");
  const keyBytes = Uint8Array.from(rawKey);
  const subtle = globalThis.crypto?.subtle;
  if (subtle && forceBackend !== "javascript") {
    const key = await subtle.importKey("raw", keyBytes.buffer, "AES-GCM", false, usage);
    return {
      backend: "webcrypto",
      encrypt: async (nonce, plaintext, additionalData) => {
        if (!usage.includes("encrypt")) throw new Error("Room key cannot encrypt");
        const ciphertext = await subtle.encrypt(
          {
            name: "AES-GCM",
            iv: Uint8Array.from(nonce).buffer,
            additionalData: Uint8Array.from(additionalData).buffer,
            tagLength: 128,
          },
          key,
          Uint8Array.from(plaintext).buffer,
        );
        return new Uint8Array(ciphertext);
      },
      decrypt: async (nonce, ciphertext, additionalData) => {
        if (!usage.includes("decrypt")) throw new Error("Room key cannot decrypt");
        const plaintext = await subtle.decrypt(
          {
            name: "AES-GCM",
            iv: Uint8Array.from(nonce).buffer,
            additionalData: Uint8Array.from(additionalData).buffer,
            tagLength: 128,
          },
          key,
          Uint8Array.from(ciphertext).buffer,
        );
        return new Uint8Array(plaintext);
      },
    };
  }
  if (forceBackend === "webcrypto") throw new Error("Web Crypto is unavailable in this browser");
  return {
    backend: "javascript",
    encrypt: async (nonce, plaintext, additionalData) => {
      if (!usage.includes("encrypt")) throw new Error("Room key cannot encrypt");
      return gcm(keyBytes, nonce, additionalData).encrypt(plaintext);
    },
    decrypt: async (nonce, ciphertext, additionalData) => {
      if (!usage.includes("decrypt")) throw new Error("Room key cannot decrypt");
      return gcm(keyBytes, nonce, additionalData).decrypt(ciphertext);
    },
  };
}

export function positionPayload(
  senderId: string,
  sequence: number,
  nickname: string,
  mapId: string,
  fix: PlayerFix,
): WirePosition {
  const heading = fix.forward ? ((Math.atan2(fix.forward.x, fix.forward.z) * 180) / Math.PI + 360) % 360 : null;
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

export async function encryptPosition(key: RoomCipher, roomId: string, payload: WirePosition) {
  const nonce = secureRandom(12);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await key.encrypt(nonce, plaintext, aad(roomId));
  return JSON.stringify({ v: 1, nonce: base64Url(nonce), ciphertext: base64Url(ciphertext) } satisfies Envelope);
}

function validWirePosition(value: unknown): value is WirePosition {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.v === 1 &&
    typeof item.senderId === "string" &&
    /^[0-9a-f-]{36}$/i.test(item.senderId) &&
    Number.isSafeInteger(item.sequence) &&
    Number(item.sequence) > 0 &&
    typeof item.nickname === "string" &&
    item.nickname.length > 0 &&
    item.nickname.length <= 24 &&
    typeof item.mapId === "string" &&
    /^[a-z0-9-]{2,32}$/.test(item.mapId) &&
    [item.x, item.y, item.z, item.observedAt].every((entry) => typeof entry === "number" && Number.isFinite(entry)) &&
    (item.heading === null ||
      (typeof item.heading === "number" && Number.isFinite(item.heading) && item.heading >= 0 && item.heading < 360))
  );
}

export async function decryptPosition(
  key: RoomCipher,
  roomId: string,
  message: string | ArrayBuffer,
  now = Date.now(),
): Promise<SquadPosition> {
  const source = typeof message === "string" ? message : new TextDecoder().decode(message);
  const envelope = JSON.parse(source) as Partial<Envelope>;
  if (envelope.v !== 1 || typeof envelope.nonce !== "string" || typeof envelope.ciphertext !== "string")
    throw new Error("Invalid encrypted envelope");
  const nonce = decodeBase64Url(envelope.nonce);
  if (nonce.length !== 12) throw new Error("Invalid AES-GCM nonce");
  const plaintext = await key.decrypt(nonce, decodeBase64Url(envelope.ciphertext), aad(roomId));
  const payload: unknown = JSON.parse(new TextDecoder().decode(plaintext));
  if (!validWirePosition(payload)) throw new Error("Invalid position payload");
  if (payload.observedAt > now + 30_000 || payload.observedAt < now - ROOM_LIFETIME_MS)
    throw new Error("Position timestamp is outside the room window");
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
