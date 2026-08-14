import { describe, expect, it } from "vitest";
import {
  createInvitation,
  createLanInvitation,
  createSenderId,
  decryptPosition,
  encryptPosition,
  importRoomKey,
  parseInvitation,
  positionPayload,
  roomCreatedAt,
  validateRoomId,
} from "./protocol";

const fix = {
  observedAt: Date.now(),
  filename: "test.png",
  position: { x: 12, y: 3, z: -8 },
  quaternion: null,
  forward: { x: 1, y: 0, z: 0 },
  gameTime: null,
  mapId: "customs",
  floorId: null,
};

describe("Raid Signal protocol", () => {
  it("creates a fragment-key invitation with a stateless creation time", () => {
    const now = Date.now();
    const invitation = createInvitation("https://signal.example", now);
    expect(invitation.url).toContain(`/room/${invitation.roomId}#`);
    expect(roomCreatedAt(invitation.roomId)).toBe(Math.floor(now / 1000) * 1000);
    expect(parseInvitation(invitation.url).rawKey).toEqual(invitation.rawKey);
  });

  it("creates LAN invitations with a LAN websocket endpoint", () => {
    const invitation = createLanInvitation("http://192.168.1.20:43120");
    expect(invitation.transport).toBe("lan");
    expect(invitation.url).toContain(`http://192.168.1.20:43120/lan/${invitation.roomId}#`);
    expect(parseInvitation(invitation.url).webSocketUrl).toBe("ws://192.168.1.20:43120/ws");
    expect(() => parseInvitation(invitation.url.replace("/lan/", "/room/"))).toThrow("HTTPS");
  });

  it("keeps a LAN invitation valid for the life of its ephemeral host", () => {
    const invitation = createLanInvitation("http://192.168.1.20:43120", Date.now() - 4 * 60 * 60 * 1000);
    expect(parseInvitation(invitation.url).transport).toBe("lan");
  });

  it("creates RFC 4122 version 4 sender IDs without randomUUID", () => {
    expect(createSenderId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("rejects expired rooms", () => {
    const invitation = createInvitation("https://signal.example", Date.now() - 3 * 60 * 60 * 1000 - 1000);
    expect(() => validateRoomId(invitation.roomId)).toThrow("expired");
  });

  it("round-trips encrypted positions and binds them to a room", async () => {
    const invitation = createInvitation("https://signal.example");
    const key = await importRoomKey(invitation.rawKey);
    const encrypted = await encryptPosition(
      key,
      invitation.roomId,
      positionPayload(crypto.randomUUID(), 1, "ALPHA", "customs", fix),
    );
    const decoded = await decryptPosition(key, invitation.roomId, encrypted);
    expect(decoded.nickname).toBe("ALPHA");
    expect(decoded.position).toEqual(fix.position);
    await expect(decryptPosition(key, createInvitation("https://signal.example").roomId, encrypted)).rejects.toThrow();
  });

  it("rejects tampering and wrong keys", async () => {
    const invitation = createInvitation("https://signal.example");
    const key = await importRoomKey(invitation.rawKey);
    const encrypted = await encryptPosition(
      key,
      invitation.roomId,
      positionPayload(crypto.randomUUID(), 1, "ALPHA", "customs", fix),
    );
    const envelope = JSON.parse(encrypted);
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    await expect(decryptPosition(key, invitation.roomId, JSON.stringify(envelope))).rejects.toThrow();
    const wrongKey = await importRoomKey(createInvitation("https://signal.example").rawKey);
    await expect(decryptPosition(wrongKey, invitation.roomId, encrypted)).rejects.toThrow();
  });

  it("interoperates between native Web Crypto and the JavaScript fallback", async () => {
    const invitation = createLanInvitation("http://192.168.1.20:43120");
    const nativeKey = await importRoomKey(invitation.rawKey, ["encrypt", "decrypt"], "webcrypto");
    const fallbackKey = await importRoomKey(invitation.rawKey, ["encrypt", "decrypt"], "javascript");
    const fromNative = await encryptPosition(
      nativeKey,
      invitation.roomId,
      positionPayload(createSenderId(), 1, "ALPHA", "customs", fix),
    );
    await expect(decryptPosition(fallbackKey, invitation.roomId, fromNative)).resolves.toMatchObject({
      nickname: "ALPHA",
    });
    const fromFallback = await encryptPosition(
      fallbackKey,
      invitation.roomId,
      positionPayload(createSenderId(), 2, "BRAVO", "customs", fix),
    );
    await expect(decryptPosition(nativeKey, invitation.roomId, fromFallback)).resolves.toMatchObject({
      nickname: "BRAVO",
    });
  });
});
