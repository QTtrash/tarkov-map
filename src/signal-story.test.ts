import { describe, expect, it } from "vitest";
import { signalStoryState } from "./signal-story";

describe("signal story progression", () => {
  it("clamps progress and selects stable chapters", () => {
    expect(signalStoryState(-1).chapter).toBe(0);
    expect(signalStoryState(.26).chapter).toBe(1);
    expect(signalStoryState(.74).chapter).toBe(2);
    expect(signalStoryState(2).chapter).toBe(3);
  });

  it("reveals the relay before delivery", () => {
    const sealed = signalStoryState(.55);
    expect(sealed.relay).toBeGreaterThan(0);
    expect(sealed.delivery).toBe(0);
    expect(signalStoryState(.9).delivery).toBeGreaterThan(.8);
  });
});
