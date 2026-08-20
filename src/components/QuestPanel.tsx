import { useEffect, useMemo, useState } from "react";
import { getMapDefinition } from "../data/maps";
import { getQuestProgress, setQuestProgress } from "../locator";
import { buildActiveQuestObjectivePois, compareQuests, effectiveQuestStatus, questStatuses } from "../quest";
import type { QuestBundle, QuestProgress, QuestStatus, QuestObjectivePoi } from "../types";
import { parseQuestBundle } from "../validation";
import { UiIcon } from "./Icons";
import { Dialog } from "./Dialog";

interface QuestPanelProps {
  open: boolean;
  mapId: string;
  onClose: () => void;
  onFocusObjective: (mapId: string, poi: QuestObjectivePoi | null) => void;
  onActiveObjectivePoisChange?: (pois: QuestObjectivePoi[]) => void;
}

type StatusFilter = "all" | "actionable" | QuestStatus;

function mapLabel(mapId: string) {
  return getMapDefinition(mapId)?.displayName ?? mapId.replaceAll("-", " ");
}

export function QuestPanel({ open, mapId, onClose, onFocusObjective, onActiveObjectivePoisChange }: QuestPanelProps) {
  const [mode, setMode] = useState<"regular" | "pve">("regular");
  const [bundle, setBundle] = useState<QuestBundle | null>(null);
  const [progress, setProgress] = useState<QuestProgress[]>([]);
  const [query, setQuery] = useState("");
  const [showAllMaps, setShowAllMaps] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [traderFilter, setTraderFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void Promise.all([
      fetch(`/maps/quests/${mode}.json`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`Quest data unavailable (${response.status})`);
        return response.json();
      }),
      getQuestProgress(mode),
    ])
      .then(([nextBundle, nextProgress]) => {
        setBundle(parseQuestBundle(nextBundle));
        setProgress(nextProgress);
        setExpanded(new Set());
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(String(reason));
      });
    return () => controller.abort();
  }, [mode]);

  const progressIndex = useMemo(() => new Map(progress.map((entry) => [entry.taskId, entry])), [progress]);
  const questIndex = useMemo(() => new Map((bundle?.quests ?? []).map((quest) => [quest.id, quest])), [bundle]);
  const traders = useMemo(() => [...new Set((bundle?.quests ?? []).map((quest) => quest.traderName))].sort(), [bundle]);
  const quests = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (bundle?.quests ?? [])
      .filter((quest) => showAllMaps || quest.mapIds.includes(mapId))
      .filter((quest) => traderFilter === "all" || quest.traderName === traderFilter)
      .filter((quest) => {
        const status = effectiveQuestStatus(quest, progressIndex);
        return (
          statusFilter === "all" ||
          (statusFilter === "actionable" ? status === "active" || status === "available" : status === statusFilter)
        );
      })
      .filter(
        (quest) =>
          !needle ||
          quest.name.toLocaleLowerCase().includes(needle) ||
          quest.traderName.toLocaleLowerCase().includes(needle) ||
          quest.summary.toLocaleLowerCase().includes(needle) ||
          quest.objectives.some((objective) => objective.description.toLocaleLowerCase().includes(needle)),
      )
      .sort((left, right) => compareQuests(left, right, progressIndex))
      .slice(0, 200);
  }, [bundle, mapId, progressIndex, query, showAllMaps, statusFilter, traderFilter]);

  const activeObjectivePois = useMemo<QuestObjectivePoi[]>(() => {
    return buildActiveQuestObjectivePois(bundle, mapId, progressIndex);
  }, [bundle, mapId, progressIndex]);

  useEffect(() => {
    if (!onActiveObjectivePoisChange) return;
    onActiveObjectivePoisChange(activeObjectivePois);
  }, [activeObjectivePois, onActiveObjectivePoisChange]);

  function changeMode(nextMode: "regular" | "pve") {
    if (nextMode === mode) return;
    setBundle(null);
    setProgress([]);
    setExpanded(new Set());
    setError(null);
    onActiveObjectivePoisChange?.([]);
    setMode(nextMode);
  }

  async function updateStatus(taskId: string, status: QuestStatus) {
    try {
      const next = await setQuestProgress(mode, taskId, status);
      setProgress((current) => [...current.filter((entry) => entry.taskId !== taskId), next]);
    } catch (reason) {
      setError(String(reason));
    }
  }

  function toggleExpanded(taskId: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  if (!open) return null;
  return (
    <Dialog className="quest-dialog" titleId="quest-title" onClose={onClose}>
      <header>
        <div>
          <span className="kicker">OFFLINE RAID PLANNING</span>
          <h2 id="quest-title">Quest navigator</h2>
        </div>
        <button className="bare-icon" onClick={onClose} aria-label="Close quests">
          <UiIcon name="close" />
        </button>
      </header>
      <div className="quest-toolbar">
        <div className="segmented">
          <button className={mode === "regular" ? "active" : ""} onClick={() => changeMode("regular")}>
            PVP
          </button>
          <button className={mode === "pve" ? "active" : ""} onClick={() => changeMode("pve")}>
            PVE
          </button>
        </div>
        <label className="intel-search">
          <UiIcon name="search" size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quests, traders, objectives"
          />
        </label>
        <label className="compact-check">
          <input type="checkbox" checked={showAllMaps} onChange={(event) => setShowAllMaps(event.target.checked)} />
          All maps
        </label>
        <label className="quest-filter">
          <span>STATUS</span>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
            <option value="all">ALL · ACTIONABLE FIRST</option>
            <option value="actionable">ACTIONABLE ONLY</option>
            {questStatuses.map((status) => (
              <option value={status} key={status}>
                {status.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
        <label className="quest-filter">
          <span>TRADER</span>
          <select value={traderFilter} onChange={(event) => setTraderFilter(event.target.value)}>
            <option value="all">ALL TRADERS</option>
            {traders.map((trader) => (
              <option value={trader} key={trader}>
                {trader.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="quest-result-bar">
        <span>{quests.length} QUESTS</span>
        <b>{showAllMaps ? "ALL LOCATIONS" : mapLabel(mapId).toUpperCase()}</b>
      </div>
      {error && <p className="error-box">{error}</p>}
      <div className="quest-list">
        {quests.map((quest) => {
          const status = effectiveQuestStatus(quest, progressIndex);
          const isExpanded = expanded.has(quest.id);
          return (
            <article className={`quest-card ${status}`} key={quest.id}>
              <header>
                <button className="quest-expand" onClick={() => toggleExpanded(quest.id)} aria-expanded={isExpanded}>
                  <span>
                    {quest.traderName.toUpperCase()} ·{" "}
                    {quest.minPlayerLevel > 0 ? `LEVEL ${quest.minPlayerLevel}` : "ANY LEVEL"} · CHAIN{" "}
                    {quest.chainDepth + 1}
                  </span>
                  <strong>{quest.name}</strong>
                  <small>{quest.summary}</small>
                </button>
                <select
                  value={status}
                  aria-label={`Status for ${quest.name}`}
                  onChange={(event) => void updateStatus(quest.id, event.target.value as QuestStatus)}
                >
                  {questStatuses.map((value) => (
                    <option key={value} value={value}>
                      {value.toUpperCase()}
                    </option>
                  ))}
                </select>
              </header>
              <div className="quest-map-tags">
                {quest.mapIds.length ? (
                  quest.mapIds.map((questMapId) => (
                    <button
                      className={questMapId === mapId ? "active" : ""}
                      key={questMapId}
                      onClick={() => onFocusObjective(questMapId, null)}
                    >
                      {mapLabel(questMapId)}
                    </button>
                  ))
                ) : (
                  <span>LOCATION NOT SPECIFIED</span>
                )}
                <i>{status.toUpperCase()}</i>
              </div>
              {isExpanded && (
                <div className="quest-details">
                  {quest.requirements.length > 0 && (
                    <section>
                      <h4>PREREQUISITES</h4>
                      <p>
                        {quest.requirements
                          .map((requirement) => questIndex.get(requirement.taskId)?.name ?? "Unknown quest")
                          .join(" · ")}
                      </p>
                    </section>
                  )}
                  <section>
                    <h4>WHAT TO DO</h4>
                    {quest.objectives.map((objective, objectiveIndex) => {
                      const navigableMaps = objective.mapIds.length ? objective.mapIds : quest.mapIds;
                      return (
                        <div className="quest-objective-row" key={objective.id}>
                          <div>
                            <b>{String(objectiveIndex + 1).padStart(2, "0")}</b>
                            <span>{objective.description}</span>
                            {objective.details.map((detail) => (
                              <small key={detail}>{detail}</small>
                            ))}
                          </div>
                          <div className="quest-objective-actions">
                            {navigableMaps.map((objectiveMapId) => {
                              const zone = objective.zones.find((candidate) => candidate.mapId === objectiveMapId);
                              const poi = zone
                                ? {
                                    id: `quest-${quest.id}-${objective.id}-${objectiveMapId}`,
                                    kind: "quest-objective" as const,
                                    category: "quest-objective" as const,
                                    mapId: objectiveMapId,
                                    name: quest.name,
                                    aliases: [objective.description],
                                    description: objective.description,
                                    taskId: quest.id,
                                    objectiveId: objective.id,
                                    position: zone.position,
                                    outline: zone.outline,
                                    top: zone.top,
                                    bottom: zone.bottom,
                                  }
                                : null;
                              return (
                                <button key={objectiveMapId} onClick={() => onFocusObjective(objectiveMapId, poi)}>
                                  {zone ? "SHOW POINT" : "VIEW"} · {mapLabel(objectiveMapId).toUpperCase()}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </section>
                  {quest.rewardSummary.length > 0 && (
                    <section>
                      <h4>REWARDS</h4>
                      <div className="quest-rewards">
                        {quest.rewardSummary.map((reward) => (
                          <span key={reward}>{reward}</span>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </article>
          );
        })}
        {!quests.length && !error && <p className="drawer-message">No quests match the current filters.</p>}
      </div>
    </Dialog>
  );
}
