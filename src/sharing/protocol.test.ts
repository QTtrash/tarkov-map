import { describe, expect, it } from "vitest";
import { createInvitation, decryptPosition, encryptPosition, importRoomKey, parseInvitation, positionPayload, roomCreatedAt, validateRoomId } from "./protocol";

const fix = { observedAt: Date.now(), filename: "test.png", position: { x: 12, y: 3, z: -8 }, quaternion: null, forward: { x: 1, y: 0, z: 0 }, gameTime: null, mapId: "customs", floorId: null };

describe("Raid Signal protocol", () => {
  it("creates a fragment-key invitation with a stateless creation time", () => {
    const now = Date.now();
    const invitation = createInvitation("https://signal.example", now);
    expect(invitation.url).toContain(`/room/${invitation.roomId}#`);
    expect(roomCreatedAt(invitation.roomId)).toBe(Math.floor(now / 1000) * 1000);
    expect(parseInvitation(invitation.url).rawKey).toEqual(invitation.rawKey);
  });

  it("rejects expired rooms", () => {
    const invitation = createInvitation("https://signal.example", Date.now() - 3 * 60 * 60 * 1000 - 1000);
    expect(() => validateRoomId(invitation.roomId)).toThrow("expired");
  });

  it("round-trips encrypted positions and binds them to a room", async () => {
    const invitation = createInvitation("https://signal.example");
    const key = await importRoomKey(invitation.rawKey);
    const encrypted = await encryptPosition(key, invitation.roomId, positionPayload(crypto.randomUUID(), 1, "ALPHA", "customs", fix));
    const decoded = await decryptPosition(key, invitation.roomId, encrypted);
    expect(decoded.nickname).toBe("ALPHA");
    expect(decoded.position).toEqual(fix.position);
    await expect(decryptPosition(key, createInvitation("https://signal.example").roomId, encrypted)).rejects.toThrow();
  });

  it("rejects tampering and wrong keys", async () => {
    const invitation = createInvitation("https://signal.example");
    const key = await importRoomKey(invitation.rawKey);
    const encrypted = await encryptPosition(key, invitation.roomId, positionPayload(crypto.randomUUID(), 1, "ALPHA", "customs", fix));
    const envelope = JSON.parse(encrypted);
    envelope.ciphertext = `${envelope.ciphertext.slice(0, -2)}AA`;
    await expect(decryptPosition(key, invitation.roomId, JSON.stringify(envelope))).rejects.toThrow();
    const wrongKey = await importRoomKey(createInvitation("https://signal.example").rawKey);
    await expect(decryptPosition(wrongKey, invitation.roomId, encrypted)).rejects.toThrow();
  });
});
