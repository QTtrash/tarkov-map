import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { maps } from "../data/maps";
import type { MapPoiBundle, PoiCategory } from "../types";
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
  ],
};

describe("IntelDrawer", () => {
  it("searches, focuses, and toggles bundled map intelligence", () => {
    const onFocusPoi = vi.fn();
    const onToggle = vi.fn();

    render(
      <IntelDrawer
        definition={{ ...maps[0], poiCounts: { "extract-pmc": 1 } }}
        bundle={bundle}
        loading={false}
        error={null}
        open
        visible={new Set<PoiCategory>(["extract-pmc"])}
        fix={null}
        showQuestMarkers={false}
        activeQuestCount={0}
        onOpenChange={vi.fn()}
        onToggle={onToggle}
        onToggleQuestMarkers={vi.fn()}
        onSetVisible={vi.fn()}
        onFocusPoi={onFocusPoi}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /PMC extracts/i }));
    expect(onToggle).toHaveBeenCalledWith("extract-pmc");

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
        fix={null}
        showQuestMarkers={false}
        activeQuestCount={0}
        onOpenChange={onOpenChange}
        onToggle={vi.fn()}
        onToggleQuestMarkers={vi.fn()}
        onSetVisible={vi.fn()}
        onFocusPoi={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open map legend" }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });
});
