import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QuestDetails } from "./QuestDetails";
import { loadQuestCatalog, loadQuestLinks, loadQuestImages } from "../quest-catalog";
import type { QuestBundle, QuestObjectivePoi } from "../types";

vi.mock("./QuestLocationPreview", () => ({ QuestLocationPreview: () => <div>Objective location map</div> }));
vi.mock("../quest-catalog", async (original) => ({
  ...(await original<typeof import("../quest-catalog")>()),
  loadQuestCatalog: vi.fn(),
  loadQuestLinks: vi.fn(),
  loadQuestImages: vi.fn(),
}));

const poi: QuestObjectivePoi = {
  id: "possible-2",
  kind: "quest-possible-location",
  category: "quest-objective",
  mapId: "customs",
  name: "Quest name",
  taskId: "task",
  objectiveId: "objective",
  description: "Marker fallback",
  position: { x: 0, y: 0, z: 0 },
  locationIndex: 1,
  locationCount: 3,
};
const bundle: QuestBundle = {
  schemaVersion: 2,
  generatedAt: "today",
  gameMode: "regular",
  quests: [
    {
      id: "task",
      name: "Quest name",
      traderId: "trader",
      traderName: "Trader",
      minPlayerLevel: 0,
      primaryMapId: "customs",
      mapIds: ["customs"],
      summary: "<b>Bundled summary</b>",
      experience: 0,
      chainDepth: 0,
      rewardSummary: [],
      requirements: [],
      objectives: [
        {
          id: "objective",
          description: "Find the document",
          details: ["Bring the cabin key"],
          type: "findQuestItem",
          optional: false,
          mapIds: ["customs"],
          zones: [],
          possibleLocations: [],
        },
      ],
    },
  ],
};
beforeEach(() => {
  vi.mocked(loadQuestImages).mockResolvedValue({ schemaVersion: 1, generatedAt: "today", sources: [], images: [] });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("quest marker details", () => {
  it("shows safe bundled text, exact objective details, and uncertainty for a possible location", async () => {
    vi.mocked(loadQuestCatalog).mockResolvedValue(bundle);
    vi.mocked(loadQuestLinks).mockResolvedValue({ schemaVersion: 1, generatedAt: "today", sources: [], links: [] });
    const { container } = render(<QuestDetails poi={poi} mode="regular" onClose={vi.fn()} />);
    expect(await screen.findByText("Find the document")).toBeVisible();
    expect(screen.getByText("Bring the cabin key")).toBeVisible();
    expect(screen.getByText("<b>Bundled summary</b>")).toBeVisible();
    expect(container.querySelector("b")).toBeNull();
    expect(screen.getByText(/Possible location 2 of 3.*not guaranteed/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Close quest details" })).toHaveFocus();
  });
  it("retains the marker description when offline or when the objective is missing", async () => {
    vi.mocked(loadQuestCatalog).mockRejectedValue(new Error("offline"));
    vi.mocked(loadQuestLinks).mockRejectedValue(new Error("offline"));
    render(<QuestDetails poi={poi} mode="pve" onClose={vi.fn()} />);
    expect(await screen.findByText(/Additional quest information is unavailable/)).toBeVisible();
    expect(screen.getByText("Marker fallback")).toBeVisible();
    expect(screen.queryByRole("link")).toBeNull();
    expect(loadQuestCatalog).toHaveBeenCalledWith("pve");
  });
  it("shows attributed generic artwork and keeps objective details when its file fails", async () => {
    vi.mocked(loadQuestCatalog).mockResolvedValue(bundle);
    vi.mocked(loadQuestLinks).mockResolvedValue({ schemaVersion: 1, generatedAt: "today", sources: [], links: [] });
    vi.mocked(loadQuestImages).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: "today",
      sources: [],
      images: [
        {
          gameMode: "regular",
          taskId: poi.taskId,
          kind: "generic-quest",
          path: "/maps/quests/images/5b4795fb86f7745876267770.webp",
          sourceUrl: "https://assets.tarkov.dev/5b4795fb86f7745876267770.webp",
          sha256: "a".repeat(64),
          bytes: 1234,
        },
      ],
    });
    render(<QuestDetails poi={poi} mode="regular" onClose={vi.fn()} />);
    const artwork = await screen.findByRole("img", { name: /Generic quest artwork for Quest name/ });
    expect(artwork).toHaveAttribute("src", expect.stringMatching(/^\/maps\/quests\/images\/.*\.webp\?v=/));
    fireEvent.load(artwork);
    expect(screen.getByText(/Source: Tarkov.dev/)).toBeVisible();
    fireEvent.error(artwork);
    expect(screen.getByText(/Quest artwork unavailable/)).toBeVisible();
    expect(screen.getByText("Find the document")).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });
  it("does not reuse artwork for another mode or quest", async () => {
    vi.mocked(loadQuestCatalog).mockResolvedValue(bundle);
    vi.mocked(loadQuestLinks).mockResolvedValue({ schemaVersion: 1, generatedAt: "today", sources: [], links: [] });
    vi.mocked(loadQuestImages).mockResolvedValue({
      schemaVersion: 1,
      generatedAt: "today",
      sources: [],
      images: [
        {
          gameMode: "pve",
          taskId: poi.taskId,
          kind: "generic-quest",
          path: "/maps/quests/images/5b4795fb86f7745876267770.webp",
          sourceUrl: "https://assets.tarkov.dev/5b4795fb86f7745876267770.webp",
          sha256: "a".repeat(64),
          bytes: 1234,
        },
      ],
    });
    render(<QuestDetails poi={poi} mode="regular" onClose={vi.fn()} />);
    expect(await screen.findByText(/Quest artwork unavailable/)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
