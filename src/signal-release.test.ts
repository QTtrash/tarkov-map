import { describe, expect, it } from "vitest";
import { signalRelease } from "./signal-release";

describe("signal release manifest", () => {
  it("accepts a complete installer manifest", () => {
    const downloadUrl = "https://github.com/QTtrash/tarkov-map/releases/download/v1.0.0/Raid-Signal-Setup-1.0.0.exe";
    expect(
      signalRelease({ filename: "Raid-Signal-Setup-1.0.0.exe", version: "1.0.0", sha256: "a".repeat(64), downloadUrl }),
    ).toEqual({ filename: "Raid-Signal-Setup-1.0.0.exe", version: "1.0.0", sha256: "a".repeat(64), downloadUrl });
  });

  it("rejects unsafe filenames and incomplete hashes", () => {
    expect(signalRelease({ filename: "../setup.exe", version: "1.0.0", sha256: "a".repeat(64) })).toBeNull();
    expect(signalRelease({ filename: "setup.exe", version: "1.0.0", sha256: "abc" })).toBeNull();
    expect(
      signalRelease({
        filename: "setup.exe",
        version: "1.0.0",
        sha256: "a".repeat(64),
        downloadUrl: "https://evil.example/setup.exe",
      }),
    ).toBeNull();
  });
});
