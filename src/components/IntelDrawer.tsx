import { useMemo, useState } from "react";
import { defaultVisiblePoiCategories, nearestExtracts, poiCategoryGroups, searchPois } from "../poi";
import type { MapDefinition, MapPoiBundle, PlayerFix, PoiCategory, RaidExtractState } from "../types";
import { PoiGlyph, UiIcon } from "./Icons";

interface IntelDrawerProps {
  definition: MapDefinition;
  bundle: MapPoiBundle | null;
  loading: boolean;
  error: string | null;
  open: boolean;
  visible: Set<PoiCategory>;
  fix: PlayerFix | null;
  raidExtracts?: RaidExtractState | null;
  onOpenChange: (open: boolean) => void;
  onToggle: (category: PoiCategory) => void;
  onSetVisible: (categories: PoiCategory[]) => void;
  onFocusPoi: (id: string) => void;
}

export function IntelDrawer({
  definition,
  bundle,
  loading,
  error,
  open,
  visible,
  fix,
  raidExtracts = null,
  onOpenChange,
  onToggle,
  onSetVisible,
  onFocusPoi,
}: IntelDrawerProps) {
  const [query, setQuery] = useState("");
  const results = useMemo(() => searchPois(bundle?.pois ?? [], query), [bundle, query]);
  const nearest = useMemo(
    () => fix && bundle ? nearestExtracts(
      bundle.pois,
      fix.position,
      3,
      raidExtracts?.status === "recognized" ? new Set(raidExtracts.activeExtractIds) : undefined,
    ) : [],
    [bundle, fix, raidExtracts],
  );

  return (
    <aside className={open ? "intel-shell open" : "intel-shell"} aria-label="Map intelligence">
      <nav className="intel-rail" aria-label="Map tools">
        <button className={open ? "rail-button active" : "rail-button"} onClick={() => onOpenChange(!open)} aria-label={open ? "Close map legend" : "Open map legend"} title="Map intelligence">
          <UiIcon name="layers" />
          <span>Intel</span>
        </button>
      </nav>

      {open && (
        <div className="intel-drawer">
          <header className="drawer-header">
            <div><span className="kicker">MAP INTELLIGENCE</span><h2>Legend</h2></div>
            <button className="bare-icon" onClick={() => onOpenChange(false)} aria-label="Close map legend"><UiIcon name="close" /></button>
          </header>

          <label className="intel-search">
            <UiIcon name="search" size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find an extract or location" />
          </label>

          {query.trim() && (
            <section className="search-results" aria-label="Search results">
              {results.length ? results.map((poi) => (
                <button key={poi.id} onClick={() => onFocusPoi(poi.id)}>
                  <PoiGlyph category={poi.category} size={15} />
                  <span>{poi.name}<small>{poi.category.replaceAll("-", " ")}</small></span>
                </button>
              )) : <p>No matching map locations</p>}
            </section>
          )}

          {!query.trim() && fix && nearest.length > 0 && (
            <section className="nearest-section">
              <div className="drawer-section-title"><span>{raidExtracts?.status === "recognized" ? "Nearest active extracts" : "Nearest possible extracts"}</span><small>Direct distance</small></div>
              {nearest.map(({ poi, distance }, index) => (
                <button className="nearest-row" key={poi.id} onClick={() => onFocusPoi(poi.id)}>
                  <b>{String(index + 1).padStart(2, "0")}</b>
                  <span>{poi.name}<small>{poi.category.replace("extract-", "").toUpperCase()}</small></span>
                  <strong>{Math.round(distance)} m</strong>
                </button>
              ))}
            </section>
          )}

          {!query.trim() && (
            <section className={raidExtracts?.status === "recognized" ? "raid-intel recognized" : "raid-intel"} aria-live="polite">
              <div className="drawer-section-title"><span>Raid availability</span><small>{raidExtracts?.status === "recognized" ? `${Math.round(raidExtracts.confidence * 100)}% confidence` : "Unknown"}</small></div>
              {raidExtracts?.status === "recognized" ? (
                <><strong>{raidExtracts.message}</strong><p>{raidExtracts.recognizedNames.join(" · ")}</p></>
              ) : (
                <><strong>Active exits not confirmed</strong><p>Press O in raid, keep the extraction panel visible, then take a screenshot.</p></>
              )}
            </section>
          )}

          <div className="legend-actions">
            <button onClick={() => onSetVisible(defaultVisiblePoiCategories)}>Recommended</button>
            <button onClick={() => onSetVisible([])}>Hide all</button>
          </div>

          <div className="legend-groups">
            {poiCategoryGroups.map((group) => {
              const available = group.categories.filter((category) => (definition.poiCounts[category.id] ?? 0) > 0);
              if (!available.length) return null;
              return (
                <section className="legend-group" key={group.id}>
                  <h3>{group.name}</h3>
                  {available.map((category) => (
                    <button
                      className={visible.has(category.id) ? `legend-row ${category.id} enabled` : `legend-row ${category.id}`}
                      key={category.id}
                      aria-pressed={visible.has(category.id)}
                      onClick={() => onToggle(category.id)}
                    >
                      <span className="legend-symbol"><PoiGlyph category={category.id} /></span>
                      <span>{category.name}</span>
                      <b>{definition.poiCounts[category.id]}</b>
                      <i aria-hidden="true" />
                    </button>
                  ))}
                </section>
              );
            })}
          </div>

          {loading && <p className="drawer-message">Loading bundled map intelligence…</p>}
          {error && <p className="drawer-message error">{error}</p>}
          {!loading && !error && bundle && bundle.pois.length === 0 && <p className="drawer-message">No intelligence is currently available for this map.</p>}
          <footer className="intel-note">Locations are possible static points. Raid availability is not guaranteed.</footer>
        </div>
      )}
    </aside>
  );
}
