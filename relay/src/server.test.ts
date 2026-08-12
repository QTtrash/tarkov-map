import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { WebSocket } from "ws";
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

test("VPS relay fans out opaque frames without echoing to sender", async (context) => {
  const port = 32117;
  const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], { cwd: new URL("..", import.meta.url), env: { ...process.env, PORT: String(port), STATIC_ROOT: "/tmp", RELEASE_ROOT: "/tmp" }, stdio: ["ignore", "pipe", "pipe"] });
  context.after(() => child.kill("SIGTERM"));
  await once(child.stdout, "data");
  const id = roomId(Date.now());
  const first = new WebSocket(`ws://127.0.0.1:${port}/v1/rooms/${id}`);
  const second = new WebSocket(`ws://127.0.0.1:${port}/v1/rooms/${id}`);
  await Promise.all([once(first, "open"), once(second, "open")]);
  context.after(() => { first.close(); second.close(); });
  const received = once(second, "message");
  first.send("opaque-ciphertext");
  const [payload] = await received;
  assert.equal(payload.toString(), "opaque-ciphertext");
});
