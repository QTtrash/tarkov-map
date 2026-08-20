import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestBundle, QuestDefinition, QuestObjectivePoi } from "../types";
import { QuestPanel } from "./QuestPanel";

const activeQuest: QuestDefinition = {
  id: "active-task",
  name: "Active task",
  traderId: "trader",
  traderName: "Prapor",
  minPlayerLevel: 1,
  primaryMapId: "customs",
  mapIds: ["customs"],
  summary: "Inspect the checkpoint",
  experience: 100,
  chainDepth: 0,
  rewardSummary: [],
  requirements: [],
  objectives: [
    {
      id: "objective",
      description: "Inspect the checkpoint",
      type: "visit",
      optional: false,
      mapIds: ["customs"],
      details: [],
      zones: [{ mapId: "customs", position: { x: 10, y: 0, z: 20 }, outline: [], top: null, bottom: null }],
    },
  ],
};

function bundle(gameMode: "regular" | "pve", quests: QuestDefinition[]): QuestBundle {
  return { schemaVersion: 2, generatedAt: "2026-08-20T00:00:00.000Z", gameMode, quests };
}

describe("QuestPanel", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      "quest-progress:regular",
      JSON.stringify([{ taskId: activeQuest.id, status: "active", updatedAt: 1 }]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => ({
        ok: true,
        json: async () => (String(input).includes("pve.json") ? bundle("pve", []) : bundle("regular", [activeQuest])),
      })),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clears active markers immediately when the game mode changes", async () => {
    const onActiveObjectivePoisChange = vi.fn<(pois: QuestObjectivePoi[]) => void>();

    render(
      <QuestPanel
        open
        mapId="customs"
        onClose={vi.fn()}
        onFocusObjective={vi.fn()}
        onActiveObjectivePoisChange={onActiveObjectivePoisChange}
      />,
    );

    await waitFor(() =>
      expect(onActiveObjectivePoisChange).toHaveBeenLastCalledWith([expect.objectContaining({ mapId: "customs" })]),
    );

    fireEvent.click(screen.getByRole("button", { name: "PVE" }));
    expect(onActiveObjectivePoisChange).toHaveBeenCalledWith([]);
    await waitFor(() => expect(screen.getByText("0 QUESTS")).toBeInTheDocument());
  });
});
