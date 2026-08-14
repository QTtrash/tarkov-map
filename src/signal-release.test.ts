import { describe, expect, it } from "vitest";
import { signalRelease } from "./signal-release";

describe("signal release manifest", () => {
  it("accepts a complete installer manifest", () => {
    const downloadUrl = "https://github.com/QTtrash/tarkov-map/releases/download/v1.0.0/Raid-Signal-Setup-1.0.0.exe";
    const publishedAt = "2026-08-14T18:02:39Z";
    expect(
      signalRelease({
        filename: "Raid-Signal-Setup-1.0.0.exe",
        version: "1.0.0",
        sha256: "a".repeat(64),
        downloadUrl,
        size: 26194715,
        publishedAt,
      }),
    ).toEqual({
      filename: "Raid-Signal-Setup-1.0.0.exe",
      version: "1.0.0",
      sha256: "a".repeat(64),
      downloadUrl,
      size: 26194715,
      publishedAt,
    });
  });

  it("rejects unsafe filenames and incomplete hashes", () => {
    const otherwiseValid = {
      filename: "Raid-Signal-Setup-1.0.0.exe",
      version: "1.0.0",
      sha256: "a".repeat(64),
      downloadUrl: "https://github.com/QTtrash/tarkov-map/releases/download/v1.0.0/Raid-Signal-Setup-1.0.0.exe",
      size: 26194715,
      publishedAt: "2026-08-14T18:02:39Z",
    };
    expect(signalRelease({ ...otherwiseValid, filename: "../setup.exe" })).toBeNull();
    expect(signalRelease({ ...otherwiseValid, sha256: "abc" })).toBeNull();
    expect(signalRelease({ ...otherwiseValid, size: 0 })).toBeNull();
    expect(signalRelease({ ...otherwiseValid, publishedAt: "not-a-date" })).toBeNull();
    expect(
      signalRelease({
        ...otherwiseValid,
        downloadUrl: "https://evil.example/setup.exe",
      }),
    ).toBeNull();
  });
});
