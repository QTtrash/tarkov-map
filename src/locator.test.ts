import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const bridge = vi.hoisted(() => ({
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  listen: vi.fn(async (event: string, handler: (event: { payload: unknown }) => void) => {
    bridge.listeners.set(event, handler);
    return () => bridge.listeners.delete(event);
  }),
  emitTo: vi.fn(async () => undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({ listen: bridge.listen, emitTo: bridge.emitTo }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn(async () => undefined) }));

import { publishSquadPositions, subscribeSquadPositions } from "./locator";

const position = {
  senderId: "11111111-1111-1111-1111-111111111111",
  sequence: 1,
  nickname: "PLAYER",
  mapId: "customs",
  position: { x: 1, y: 2, z: 3 },
  heading: null,
  observedAt: 1,
  receivedAt: 2,
};

describe("squad position bridge", () => {
  beforeEach(() => {
    Object.defineProperty(window, "__TAURI_INTERNALS__", { value: {}, configurable: true });
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    bridge.listeners.clear();
    vi.clearAllMocks();
  });

  it("stays inert outside the native runtime", async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    await publishSquadPositions([position]);
    const unlisten = await subscribeSquadPositions(vi.fn());
    expect(bridge.emitTo).not.toHaveBeenCalled();
    expect(bridge.listen).not.toHaveBeenCalled();
    expect(() => unlisten()).not.toThrow();
  });

  it("sends positions to the overlay window", async () => {
    await publishSquadPositions([position]);
    expect(bridge.emitTo).toHaveBeenCalledWith("overlay", "squad://positions", [position]);
  });

  it("delivers valid payloads and drops malformed ones", async () => {
    const handler = vi.fn();
    await subscribeSquadPositions(handler);
    const deliver = bridge.listeners.get("squad://positions")!;
    deliver({ payload: [position] });
    deliver({ payload: [{ ...position, senderId: "not-a-sender" }] });
    deliver({ payload: "not-an-array" });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith([position]);
  });
});
