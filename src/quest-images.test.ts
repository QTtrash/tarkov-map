import { describe, expect, it } from "vitest";
import { isQuestImageSource } from "./quest-images";
import { parseQuestImages } from "./validation";

const taskId = "5b4795fb86f7745876267770";
const entry = {
  gameMode: "regular",
  taskId,
  kind: "generic-quest",
  path: `/maps/quests/images/${taskId}.webp`,
  sourceUrl: `https://assets.tarkov.dev/${taskId}.webp`,
  sha256: "a".repeat(64),
  bytes: 1234,
};
const metadata = {
  schemaVersion: 1,
  generatedAt: "2026-09-24",
  sources: ["https://json.tarkov.dev/regular/tasks"],
  images: [entry],
};

describe("quest image metadata", () => {
  it("accepts attributed same-origin assets matched to an exact quest and mode", () => {
    expect(parseQuestImages(metadata).images[0]).toEqual(entry);
  });
  it("rejects external runtime paths, traversal, mismatched identities and unbounded metadata", () => {
    for (const patch of [
      { path: entry.sourceUrl },
      { path: "/maps/quests/images/../secret.webp" },
      { taskId: "b".repeat(24) },
      { gameMode: "unknown" },
      { kind: "objective-photo" },
      { sha256: "invalid" },
      { bytes: 2_000_001 },
    ]) {
      expect(() => parseQuestImages({ ...metadata, images: [{ ...entry, ...patch }] })).toThrow();
    }
    expect(() => parseQuestImages({ ...metadata, images: [entry, entry] })).toThrow();
  });
  it("rejects redirects, credentials, active content, and lookalike source hosts", () => {
    for (const url of [
      "javascript:alert(1)",
      entry.sourceUrl.replace("https:", "http:"),
      entry.sourceUrl + "?redirect=evil",
      entry.sourceUrl.replace("assets.", "user@assets."),
      entry.sourceUrl.replace(".dev/", ".dev.evil/"),
      entry.sourceUrl.replace(".webp", ".svg"),
    ])
      expect(isQuestImageSource(url)).toBe(false);
  });
});
