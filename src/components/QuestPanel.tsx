import { useEffect, useMemo, useState } from "react";
import { getQuestProgress, setQuestProgress } from "../locator";
import type { QuestBundle, QuestDefinition, QuestProgress, QuestStatus, QuestObjectivePoi } from "../types";
import { UiIcon } from "./Icons";

interface QuestPanelProps {
  open: boolean;
  mapId: string;
  onClose: () => void;
  onFocusObjective: (poi: QuestObjectivePoi) => void;
}

const statuses: QuestStatus[] = ["locked", "available", "active", "completed", "failed"];

export function QuestPanel({ open, mapId, onClose, onFocusObjective }: QuestPanelProps) {
  const [mode, setMode] = useState<"regular" | "pve">("regular");
  const [bundle, setBundle] = useState<QuestBundle | null>(null);
  const [progress, setProgress] = useState<QuestProgress[]>([]);
  const [query, setQuery] = useState("");
  const [showAllMaps, setShowAllMaps] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setError(null);
    void Promise.all([
      fetch(`/maps/quests/${mode}.json`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`Quest data unavailable (${response.status})`);
        return response.json() as Promise<QuestBundle>;
      }),
      getQuestProgress(mode),
    ]).then(([nextBundle, nextProgress]) => {
      if (nextBundle.schemaVersion !== 1) throw new Error("Unsupported quest data format");
      setBundle(nextBundle);
      setProgress(nextProgress);
    }).catch((reason) => {
      if (!controller.signal.aborted) setError(String(reason));
    });
    return () => controller.abort();
  }, [mode, open]);

  const progressIndex = useMemo(() => new Map(progress.map((entry) => [entry.taskId, entry])), [progress]);
  const effectiveStatus = (quest: QuestDefinition): QuestStatus => {
    const saved = progressIndex.get(quest.id)?.status;
    if (saved) return saved;
    return quest.requirements.every((requirement) => progressIndex.get(requirement.taskId)?.status === "completed") ? "available" : "locked";
  };
  const quests = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (bundle?.quests ?? [])
      .filter((quest) => showAllMaps || quest.mapIds.includes(mapId))
      .filter((quest) => !needle || quest.name.toLocaleLowerCase().includes(needle) || quest.objectives.some((objective) => objective.description.toLocaleLowerCase().includes(needle)))
      .sort((left, right) => {
        const activeDelta = Number(effectiveStatus(right) === "active") - Number(effectiveStatus(left) === "active");
        return activeDelta || left.name.localeCompare(right.name);
      })
      .slice(0, 100);
  // progressIndex intentionally drives effective task availability.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle, mapId, progressIndex, query, showAllMaps]);

  async function updateStatus(taskId: string, status: QuestStatus) {
    try {
      const next = await setQuestProgress(mode, taskId, status);
      setProgress((current) => [...current.filter((entry) => entry.taskId !== taskId), next]);
    } catch (reason) {
      setError(String(reason));
    }
  }

  if (!open) return null;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="dialog quest-dialog" role="dialog" aria-modal="true" aria-labelledby="quest-title" onMouseDown={(event) => event.stopPropagation()}>
        <header><div><span className="kicker">LOCAL RAID PLANNING</span><h2 id="quest-title">Quest navigator</h2></div><button className="bare-icon" onClick={onClose} aria-label="Close quests"><UiIcon name="close" /></button></header>
        <div className="quest-toolbar">
          <div className="segmented"><button className={mode === "regular" ? "active" : ""} onClick={() => setMode("regular")}>PVP</button><button className={mode === "pve" ? "active" : ""} onClick={() => setMode("pve")}>PVE</button></div>
          <label className="intel-search"><UiIcon name="search" size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks and objectives" /></label>
          <label className="compact-check"><input type="checkbox" checked={showAllMaps} onChange={(event) => setShowAllMaps(event.target.checked)} />All maps</label>
        </div>
        {error && <p className="error-box">{error}</p>}
        <div className="quest-list">
          {quests.map((quest) => {
            const status = effectiveStatus(quest);
            const objectives = quest.objectives.filter((objective) => objective.zones.some((zone) => zone.mapId === mapId));
            return <article className={`quest-card ${status}`} key={quest.id}>
              <header><div><span>LEVEL {quest.minPlayerLevel}</span><strong>{quest.name}</strong></div><select value={status} aria-label={`Status for ${quest.name}`} onChange={(event) => void updateStatus(quest.id, event.target.value as QuestStatus)}>{statuses.map((value) => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></header>
              {objectives.map((objective) => <div className="quest-objective-row" key={objective.id}><span>{objective.description}</span>{objective.zones.filter((zone) => zone.mapId === mapId).map((zone, index) => <button key={`${objective.id}-${index}`} onClick={() => onFocusObjective({ id: `quest-${quest.id}-${objective.id}-${index}`, kind: "quest-objective", category: "quest-objective", name: quest.name, aliases: [objective.description], description: objective.description, taskId: quest.id, objectiveId: objective.id, position: zone.position, outline: zone.outline, top: zone.top, bottom: zone.bottom })}>SHOW ON MAP</button>)}</div>)}
              {!objectives.length && <p>No positioned objective on the selected map.</p>}
            </article>;
          })}
          {!quests.length && !error && <p className="drawer-message">No quests match the current filters.</p>}
        </div>
      </section>
    </div>
  );
}
