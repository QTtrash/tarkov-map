import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { maps } from "../data/maps";
import type { LootGroupId, MapPoiBundle, PoiCategory } from "../types";
import { IntelDrawer } from "./IntelDrawer";

const bundle: MapPoiBundle = {
  schemaVersion: 2,
  mapId: "customs",
  generatedAt: "2026-08-12T00:00:00.000Z",
  sources: ["test"],
  pois: [
    {
      id: "extract-zb-013",
      kind: "extract",
      category: "extract-pmc",
      name: "ZB-013",
      position: { x: 100, y: 0, z: 100 },
      faction: "pmc",
      switchIds: [],
    },
    {
      id: "loot-drawer",
      kind: "loot",
      category: "loot",
      name: "Drawer",
      position: { x: 120, y: 0, z: 120 },
      lootType: "drawer",
    },
    {
      id: "loot-duffle",
      kind: "loot",
      category: "loot",
      name: "Duffle bag",
      position: { x: 140, y: 0, z: 140 },
      lootType: "duffle-bag",
    },
  ],
};

describe("IntelDrawer", () => {
  it("searches, focuses, and toggles bundled map intelligence", () => {
    const onFocusPoi = vi.fn();
    const onToggle = vi.fn();
    const onHideAll = vi.fn();
    const onToggleQuestMarkers = vi.fn();
    const onToggleLootGroup = vi.fn();

    render(
      <IntelDrawer
        definition={{ ...maps[0], poiCounts: { "extract-pmc": 1, loot: 2 } }}
        bundle={bundle}
        loading={false}
        error={null}
        open
        visible={new Set<PoiCategory>(["extract-pmc"])}
        visibleLootGroups={new Set<LootGroupId>(["drawers"])}
        fix={null}
        showQuestMarkers={false}
        activeQuestCount={0}
        onOpenChange={vi.fn()}
        onToggle={onToggle}
        onToggleLootGroup={onToggleLootGroup}
        onToggleQuestMarkers={onToggleQuestMarkers}
        onHideAll={onHideAll}
        onSetVisible={vi.fn()}
        onFocusPoi={onFocusPoi}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /PMC extracts/i }));
    expect(onToggle).toHaveBeenCalledWith("extract-pmc");
    fireEvent.click(screen.getByRole("button", { name: "Hide all" }));
    expect(onHideAll).toHaveBeenCalledOnce();
    const questMarkers = screen.getByRole("button", { name: /Quest markers/i });
    expect(questMarkers).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(questMarkers);
    expect(onToggleQuestMarkers).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: /Drawers\s*1/i })).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(screen.getByRole("button", { name: /Bags, jackets, cases\s*1/i }));
    expect(onToggleLootGroup).toHaveBeenCalledWith("bags");

    fireEvent.change(screen.getByPlaceholderText("Find an extract or location"), {
      target: { value: "zb-013" },
    });
    fireEvent.click(screen.getByRole("button", { name: /ZB-013/i }));
    expect(onFocusPoi).toHaveBeenCalledWith("extract-zb-013");
  });

  it("opens from its collapsed rail", () => {
    const onOpenChange = vi.fn();
    render(
      <IntelDrawer
        definition={maps[0]}
        bundle={bundle}
        loading={false}
        error={null}
        open={false}
        visible={new Set<PoiCategory>()}
        visibleLootGroups={new Set<LootGroupId>()}
        fix={null}
        showQuestMarkers={false}
        activeQuestCount={0}
        onOpenChange={onOpenChange}
        onToggle={vi.fn()}
        onToggleLootGroup={vi.fn()}
        onToggleQuestMarkers={vi.fn()}
        onHideAll={vi.fn()}
        onSetVisible={vi.fn()}
        onFocusPoi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open map legend" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
