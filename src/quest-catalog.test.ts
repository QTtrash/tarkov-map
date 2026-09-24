import { afterEach, describe, expect, it, vi } from "vitest";
import { createQuestCatalogLoader, resolveQuestObjective } from "./quest-catalog";
import { validatedWikiUrl } from "./quest-links";
import { parseQuestLinks } from "./validation";
import type { QuestBundle, QuestObjectivePoi } from "./types";

const bundle: QuestBundle = {
  schemaVersion: 2,
  generatedAt: "2026-09-24",
  gameMode: "regular",
  quests: [
    {
      id: "task",
      name: "Quest",
      traderId: "trader",
      traderName: "Trader",
      minPlayerLevel: 0,
      primaryMapId: "customs",
      mapIds: ["customs"],
      summary: "Summary",
      experience: 0,
      chainDepth: 0,
      rewardSummary: [],
      requirements: [],
      objectives: [
        {
          id: "objective",
          description: "Correct objective",
          type: "visit",
          optional: false,
          mapIds: ["customs"],
          details: ["Bring a key"],
          zones: [],
          possibleLocations: [],
        },
      ],
    },
  ],
};
const poi: QuestObjectivePoi = {
  id: "marker",
  kind: "quest-objective",
  category: "quest-objective",
  mapId: "customs",
  taskId: "task",
  objectiveId: "objective",
  name: "Quest",
  description: "Marker description",
  position: { x: 0, y: 0, z: 0 },
};
afterEach(() => vi.unstubAllGlobals());

describe("quest catalog", () => {
  it("resolves exact task and objective identifiers rather than marker IDs or names", () => {
    expect(resolveQuestObjective(bundle, poi)?.objective.description).toBe("Correct objective");
    expect(resolveQuestObjective(bundle, { ...poi, id: "quest-active-another-id" })?.quest.summary).toBe("Summary");
    expect(resolveQuestObjective(bundle, { ...poi, taskId: "missing" })).toBeNull();
    expect(resolveQuestObjective(bundle, { ...poi, objectiveId: "missing" })).toBeNull();
  });
  it("shares validated catalogs and retries failed loads without requesting progress", async () => {
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({ ok: true, json: async () => bundle });
    vi.stubGlobal("fetch", fetcher);
    const load = createQuestCatalogLoader();
    await expect(load("regular")).rejects.toThrow("offline");
    const [first, second] = await Promise.all([load("regular"), load("regular")]);
    expect(first).toEqual(bundle);
    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenLastCalledWith("/maps/quests/regular.json");
    await expect(load("pve")).rejects.toThrow("mode");
  });
});

describe("Wiki URL metadata", () => {
  const url = "https://escapefromtarkov.fandom.com/wiki/Chumming";
  it("accepts direct HTTPS article references and rejects executable or unrelated URLs", () => {
    expect(validatedWikiUrl(url)).toBe(url);
    for (const unsafe of [
      "javascript:alert(1)",
      "data:text/html,test",
      url.replace("https:", "http:"),
      url.replace(".com", ".com.evil.test"),
      url.replace("https://", "https://user:pass@"),
      `${url}?redirect=https://evil.test`,
      `${url}#secret`,
      url.replace("/Chumming", "/Special:Redirect"),
      url.replace("/Chumming", "/%00"),
      url.replace(".com/", ".com:8443/"),
    ]) {
      expect(validatedWikiUrl(unsafe)).toBeNull();
    }
    expect(() =>
      parseQuestLinks({
        schemaVersion: 1,
        generatedAt: "today",
        sources: [],
        links: [{ gameMode: "regular", taskId: "task", wikiUrl: "javascript:alert(1)" }],
      }),
    ).toThrow();
  });
});
