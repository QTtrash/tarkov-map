import { describe, expect, it } from "vitest";
import protocol from "../contracts/protocol-v1.json";
import settings from "../contracts/settings-v2.json";
import { defaultSettings } from "./locator";
import { PROTOCOL_VERSION, ROOM_LIFETIME_MS } from "./sharing/protocol";

describe("cross-runtime contracts", () => {
  it("keeps protocol constants aligned", () => {
    expect(PROTOCOL_VERSION).toBe(protocol.protocolVersion);
    expect(ROOM_LIFETIME_MS).toBe(protocol.roomLifetimeMs);
  });

  it("keeps TypeScript settings defaults aligned", () => {
    expect(defaultSettings).toEqual(settings);
  });
});
