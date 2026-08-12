export const ROOM_LIFETIME_MS = 3 * 60 * 60 * 1000;

export function roomCreatedAt(roomId: string) {
  if (!/^[A-Za-z0-9_-]{27}$/.test(roomId)) throw new Error("invalid room");
  const bytes = Buffer.from(roomId, "base64url");
  if (bytes.length !== 20) throw new Error("invalid room");
  return bytes.readUInt32BE(0) * 1000;
}

export function roomExpiresAt(roomId: string, now = Date.now()) {
  const createdAt = roomCreatedAt(roomId);
  if (createdAt > now + 5 * 60_000 || now - createdAt >= ROOM_LIFETIME_MS) throw new Error("expired room");
  return createdAt + ROOM_LIFETIME_MS;
}
