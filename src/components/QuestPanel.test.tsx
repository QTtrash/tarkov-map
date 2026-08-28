import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { QuestBundle, QuestDefinition, QuestObjectivePoi } from "../types";
import { QuestPanel } from "./QuestPanel";

const locatorMock = vi.hoisted(() => ({
  tauri: false,
  preview: null as import("../types").QuestSyncPreview | null,
  confirmResult: {
    importedEvents: 1,
    profiles: [],
    detectedMode: null,
    enableQuestMarkers: true,
  } as import("../types").QuestSyncResult,
}));

vi.mock("../locator", async () => {
  const actual = await vi.importActual<typeof import("../locator")>("../locator");
  return {
    ...actual,
    isTauriRuntime: () => locatorMock.tauri,
    getQuestProfiles: vi.fn(async () => []),
    getQuestSyncPreview: vi.fn(async () => locatorMock.preview ?? actual.getQuestSyncPreview()),
    confirmQuestSync: vi.fn(async () => locatorMock.confirmResult),
    getQuestProgress: vi.fn(async (...args: Parameters<typeof actual.getQuestProgress>) =>
      locatorMock.tauri ? [] : actual.getQuestProgress(...args),
    ),
    syncQuestProgress: vi.fn(async () => ({
      importedEvents: 0,
      profiles: [],
      detectedMode: null,
      enableQuestMarkers: false,
    })),
  };
});

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
      possibleLocations: [],
    },
  ],
};

function bundle(gameMode: "regular" | "pve", quests: QuestDefinition[]): QuestBundle {
  return { schemaVersion: 2, generatedAt: "2026-08-20T00:00:00.000Z", gameMode, quests };
}

describe("QuestPanel", () => {
  beforeEach(() => {
    locatorMock.tauri = false;
    locatorMock.preview = null;
    locatorMock.confirmResult = {
      importedEvents: 1,
      profiles: [],
      detectedMode: null,
      enableQuestMarkers: true,
    };
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
    cleanup();
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

  it("explains a zero-event scan and copies only privacy-safe diagnostics", async () => {
    locatorMock.tauri = true;
    locatorMock.preview = {
      available: false,
      enabled: false,
      shouldReview: true,
      logsRoot: "C:\\Users\\private-name\\EFT\\Logs",
      profiles: [],
      eventCount: 0,
      sessionsScanned: 4,
      filesScanned: 8,
      notificationFilesScanned: 4,
      outputFilesScanned: 4,
      chatMessageMarkers: 0,
      lifecycleHints: 3,
      formatStatus: "no-recognized-events",
      malformedRecords: 0,
      unattributedRecords: 0,
      suspiciousSessions: 0,
      fingerprint: "a".repeat(64),
      message: "No recognized quest-event records were found.",
    };
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<QuestPanel open={false} mapId="customs" onClose={vi.fn()} onFocusObjective={vi.fn()} />);

    expect(await screen.findByRole("heading", { name: "Import detected quest progress?" })).toBeVisible();
    expect(screen.getByText("EXPERIMENTAL LOG COMPATIBILITY")).toBeVisible();
    expect(screen.getByRole("button", { name: "NO EVENTS TO IMPORT" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "COPY DIAGNOSTICS" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain("sessions-scanned: 4");
    expect(copied).not.toContain("private-name");
  });

  it("reports a successful import to the parent and enables markers once", async () => {
    const profileKey = "b".repeat(64);
    locatorMock.tauri = true;
    locatorMock.preview = {
      available: true,
      enabled: false,
      shouldReview: true,
      logsRoot: "D:\\EFT\\Logs",
      profiles: [
        {
          profileKey,
          gameMode: "regular",
          lastSeen: 10,
          eventCount: 1,
          startedCount: 1,
          failedCount: 0,
          completedCount: 0,
          isCurrent: true,
        },
      ],
      eventCount: 1,
      sessionsScanned: 1,
      filesScanned: 2,
      notificationFilesScanned: 1,
      outputFilesScanned: 1,
      chatMessageMarkers: 1,
      lifecycleHints: 0,
      formatStatus: "recognized",
      malformedRecords: 0,
      unattributedRecords: 0,
      suspiciousSessions: 0,
      fingerprint: "c".repeat(64),
      message: "Quest events were found.",
    };
    locatorMock.confirmResult = {
      importedEvents: 1,
      profiles: [{ profileKey, gameMode: "regular", lastSeen: 10, isCurrent: true, playerLevel: null }],
      detectedMode: "regular",
      enableQuestMarkers: true,
    };
    const onImportComplete = vi.fn();
    const onEnableQuestMarkersOnce = vi.fn();

    render(
      <QuestPanel
        open={false}
        mapId="customs"
        onClose={vi.fn()}
        onFocusObjective={vi.fn()}
        onImportComplete={onImportComplete}
        onEnableQuestMarkersOnce={onEnableQuestMarkersOnce}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "IMPORT AND ENABLE MARKERS" }));
    await waitFor(() => expect(onImportComplete).toHaveBeenCalledOnce());
    expect(onEnableQuestMarkersOnce).toHaveBeenCalledOnce();
  });
});
