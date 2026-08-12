import assert from "node:assert/strict";
import test from "node:test";
import { roomCreatedAt, roomExpiresAt, ROOM_LIFETIME_MS } from "./room-id.ts";

function roomId(now: number) {
  const bytes = Buffer.alloc(20);
  bytes.writeUInt32BE(Math.floor(now / 1000));
  bytes.fill(7, 4);
  return bytes.toString("base64url");
}

test("room IDs preserve issuance time and expire after three hours", () => {
  const now = Date.now();
  const id = roomId(now);
  assert.equal(roomCreatedAt(id), Math.floor(now / 1000) * 1000);
  assert.ok(roomExpiresAt(id, now) <= now + ROOM_LIFETIME_MS);
  assert.throws(() => roomExpiresAt(roomId(now - ROOM_LIFETIME_MS - 1000), now), /expired/);
});

test("malformed and future room IDs are rejected", () => {
  assert.throws(() => roomExpiresAt("not-a-room"), /invalid/);
  assert.throws(() => roomExpiresAt(roomId(Date.now() + 6 * 60_000)), /expired/);
});
