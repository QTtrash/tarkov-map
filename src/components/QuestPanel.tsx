import { useEffect, useMemo, useRef, useState } from "react";
import { getMapDefinition } from "../data/maps";
import {
  confirmQuestSync,
  dismissQuestSyncPreview,
  getQuestProfiles,
  getQuestProgress,
  getQuestSyncPreview,
  isTauriRuntime,
  setQuestPlayerLevel,
  setQuestProgress,
  setQuestSyncEnabled,
  syncQuestProgress,
} from "../locator";
import { buildActiveQuestObjectivePois, compareQuests, effectiveQuestStatus, questStatuses } from "../quest";
import type {
  QuestBundle,
  QuestDisplayStatus,
  QuestGameMode,
  QuestObjectivePoi,
  QuestProfile,
  QuestProgress,
  QuestStatus,
  QuestSyncPreview,
} from "../types";
import { parseQuestBundle } from "../validation";
import { Dialog } from "./Dialog";
import { UiIcon } from "./Icons";

interface QuestPanelProps {
  open: boolean;
  mapId: string;
  onClose: () => void;
  onFocusObjective: (mapId: string, poi: QuestObjectivePoi | null) => void;
  onActiveObjectivePoisChange?: (pois: QuestObjectivePoi[]) => void;
  onEnableQuestMarkersOnce?: () => void;
}

type StatusFilter = "all" | "actionable" | QuestDisplayStatus;

const modeLabels: Record<QuestGameMode, string> = {
  regular: "PVP",
  pve: "PVE",
  "pvp-season": "SEASONAL",
};

function mapLabel(mapId: string) {
  return getMapDefinition(mapId)?.displayName ?? mapId.replaceAll("-", " ");
}

function profileLabel(profileKey: string) {
  return `PROFILE ${profileKey.slice(0, 8).toUpperCase()}`;
}

function displayStatusLabel(status: QuestDisplayStatus, isExplicit: boolean) {
  if (isExplicit) return status.toUpperCase();
  if (status === "unknown") return "ELIGIBILITY UNKNOWN";
  return `POSSIBLY ${status.toUpperCase()}`;
}

export function QuestPanel({
  open,
  mapId,
  onClose,
  onFocusObjective,
  onActiveObjectivePoisChange,
  onEnableQuestMarkersOnce,
}: QuestPanelProps) {
  const [mode, setMode] = useState<QuestGameMode>("regular");
  const [bundle, setBundle] = useState<QuestBundle | null>(null);
  const [progress, setProgress] = useState<QuestProgress[]>([]);
  const [profiles, setProfiles] = useState<QuestProfile[]>([]);
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | undefined>();
  const [followDetected, setFollowDetected] = useState(true);
  const followDetectedRef = useRef(true);
  const [levelDraft, setLevelDraft] = useState("");
  const [review, setReview] = useState<QuestSyncPreview | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState("");
  const [showAllMaps, setShowAllMaps] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [traderFilter, setTraderFilter] = useState("all");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let disposed = false;
    void Promise.all([getQuestProfiles(), getQuestSyncPreview()])
      .then(([nextProfiles, preview]) => {
        if (disposed) return;
        setProfiles(nextProfiles);
        const newest = nextProfiles
          .filter((profile) => profile.isCurrent)
          .sort((left, right) => right.lastSeen - left.lastSeen)[0];
        if (newest) {
          setMode(newest.gameMode);
          setSelectedProfileKey(newest.profileKey);
        }
        setReview(preview);
        setSyncEnabled(preview.enabled);
        setReviewOpen(preview.shouldReview);
      })
      .catch((reason) => {
        if (!disposed) setError(String(reason));
      });
    const interval = window.setInterval(() => {
      void syncQuestProgress()
        .then((result) => {
          if (disposed) return;
          setProfiles(result.profiles);
          if (followDetectedRef.current && result.detectedMode) {
            setMode(result.detectedMode);
            setSelectedProfileKey(
              result.profiles.find((profile) => profile.gameMode === result.detectedMode && profile.isCurrent)
                ?.profileKey,
            );
          }
          if (result.importedEvents > 0) {
            setSyncMessage(`${result.importedEvents} new log event${result.importedEvents === 1 ? "" : "s"} imported`);
            setRefreshKey((current) => current + 1);
          }
        })
        .catch(() => undefined);
    }, 15_000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, []);

  const modeProfiles = useMemo(() => profiles.filter((profile) => profile.gameMode === mode), [mode, profiles]);
  const selectedProfile = useMemo(
    () =>
      modeProfiles.find((profile) => profile.profileKey === selectedProfileKey) ??
      modeProfiles.find((profile) => profile.isCurrent) ??
      modeProfiles[0],
    [modeProfiles, selectedProfileKey],
  );

  useEffect(() => {
    setLevelDraft(selectedProfile?.playerLevel?.toString() ?? "");
  }, [selectedProfile]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    void Promise.all([
      fetch(`/maps/quests/${mode}.json`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error(`Quest data unavailable (${response.status})`);
        return response.json();
      }),
      getQuestProgress(mode, selectedProfile?.profileKey),
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
  }, [mode, refreshKey, selectedProfile?.profileKey]);

  const progressIndex = useMemo(() => new Map(progress.map((entry) => [entry.taskId, entry])), [progress]);
  const questIndex = useMemo(() => new Map((bundle?.quests ?? []).map((quest) => [quest.id, quest])), [bundle]);
  const traders = useMemo(() => [...new Set((bundle?.quests ?? []).map((quest) => quest.traderName))].sort(), [bundle]);
  const playerLevel = selectedProfile?.playerLevel;
  const quests = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return (bundle?.quests ?? [])
      .filter((quest) => showAllMaps || quest.mapIds.includes(mapId))
      .filter((quest) => traderFilter === "all" || quest.traderName === traderFilter)
      .filter((quest) => {
        const status = effectiveQuestStatus(quest, progressIndex, playerLevel, mode);
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
      .sort((left, right) => compareQuests(left, right, progressIndex, playerLevel, mode))
      .slice(0, 200);
  }, [bundle, mapId, mode, playerLevel, progressIndex, query, showAllMaps, statusFilter, traderFilter]);

  const activeObjectivePois = useMemo<QuestObjectivePoi[]>(
    () => buildActiveQuestObjectivePois(bundle, mapId, progressIndex),
    [bundle, mapId, progressIndex],
  );

  useEffect(() => {
    onActiveObjectivePoisChange?.(activeObjectivePois);
  }, [activeObjectivePois, onActiveObjectivePoisChange]);

  function changeMode(nextMode: QuestGameMode) {
    if (nextMode === mode) return;
    setBundle(null);
    setProgress([]);
    setExpanded(new Set());
    setError(null);
    onActiveObjectivePoisChange?.([]);
    setMode(nextMode);
    followDetectedRef.current = false;
    setFollowDetected(false);
    setSelectedProfileKey(profiles.find((profile) => profile.gameMode === nextMode && profile.isCurrent)?.profileKey);
  }

  async function updateStatus(taskId: string, status: QuestStatus) {
    try {
      const next = await setQuestProgress(mode, taskId, status, selectedProfile?.profileKey);
      setProgress((current) => [...current.filter((entry) => entry.taskId !== taskId), next]);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function openLogReview() {
    if (!isTauriRuntime()) return;
    setSyncBusy(true);
    try {
      const preview = await getQuestSyncPreview();
      setReview(preview);
      setSyncEnabled(preview.enabled);
      setReviewOpen(true);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSyncBusy(false);
    }
  }

  async function closeLogReview() {
    setReviewOpen(false);
    if (review?.fingerprint) await dismissQuestSyncPreview(review.fingerprint).catch(() => undefined);
  }

  async function confirmImport() {
    setSyncBusy(true);
    try {
      const result = await confirmQuestSync();
      setProfiles(result.profiles);
      if (result.detectedMode) {
        setMode(result.detectedMode);
        setSelectedProfileKey(
          result.profiles.find((profile) => profile.gameMode === result.detectedMode && profile.isCurrent)?.profileKey,
        );
      }
      followDetectedRef.current = true;
      setFollowDetected(true);
      if (result.enableQuestMarkers) onEnableQuestMarkersOnce?.();
      setSyncEnabled(true);
      setSyncMessage(`${result.importedEvents} quest log event${result.importedEvents === 1 ? "" : "s"} imported`);
      setRefreshKey((current) => current + 1);
      setReviewOpen(false);
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSyncBusy(false);
    }
  }

  async function savePlayerLevel() {
    if (!selectedProfile) return;
    const parsed = levelDraft.trim() === "" ? null : Number(levelDraft);
    if (parsed !== null && (!Number.isInteger(parsed) || parsed < 1 || parsed > 79)) {
      setError("Player level must be between 1 and 79.");
      return;
    }
    try {
      const updated = await setQuestPlayerLevel(mode, selectedProfile.profileKey, parsed);
      setProfiles((current) =>
        current.map((profile) =>
          profile.profileKey === updated.profileKey && profile.gameMode === updated.gameMode ? updated : profile,
        ),
      );
      setError(null);
    } catch (reason) {
      setError(String(reason));
    }
  }

  async function pauseAutomaticSync() {
    setSyncBusy(true);
    try {
      await setQuestSyncEnabled(false);
      setSyncEnabled(false);
      setSyncMessage("automatic log sync paused");
    } catch (reason) {
      setError(String(reason));
    } finally {
      setSyncBusy(false);
    }
  }

  function followCurrentProfile() {
    const newest = profiles
      .filter((profile) => profile.isCurrent)
      .sort((left, right) => right.lastSeen - left.lastSeen)[0];
    followDetectedRef.current = true;
    setFollowDetected(true);
    if (newest) {
      setMode(newest.gameMode);
      setSelectedProfileKey(newest.profileKey);
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

  return (
    <>
      {reviewOpen && review && (
        <Dialog className="quest-review-dialog" titleId="quest-review-title" onClose={() => void closeLogReview()}>
          <header>
            <div>
              <span className="kicker">LOCAL QUEST LOG REVIEW</span>
              <h2 id="quest-review-title">Import detected quest progress?</h2>
            </div>
            <button className="bare-icon" onClick={() => void closeLogReview()} aria-label="Close quest log review">
              <UiIcon name="close" />
            </button>
          </header>
          <div className="quest-review-body">
            <p>{review.message}</p>
            <p>
              Raid Signal reads supported quest notifications from your local Tarkov logs. Profile IDs are one-way
              hashed before storage; log contents and quest progress never go to the relay or phone companion.
            </p>
            <div className="quest-review-stats">
              <span>{review.eventCount} EVENTS</span>
              <span>{review.profiles.length} PROFILES</span>
              <span>{review.filesScanned} FILES</span>
            </div>
            {review.profiles.map((profile) => (
              <article key={`${profile.gameMode}:${profile.profileKey}`}>
                <strong>{profileLabel(profile.profileKey)}</strong>
                <span>
                  {modeLabels[profile.gameMode]}
                  {profile.isCurrent ? " · CURRENT" : " · OLDER"}
                </span>
                <small>
                  {profile.startedCount} started · {profile.completedCount} completed · {profile.failedCount} failed
                </small>
              </article>
            ))}
            {(review.suspiciousSessions > 0 || review.unattributedRecords > 0 || review.malformedRecords > 0) && (
              <div className="quest-review-warning">
                {review.suspiciousSessions > 0 && (
                  <p>
                    {review.suspiciousSessions} session(s) contained a suspicious start burst; those start events will
                    be quarantined.
                  </p>
                )}
                {review.unattributedRecords > 0 && (
                  <p>
                    {review.unattributedRecords} event(s) could not be safely tied to a profile and mode and will be
                    skipped.
                  </p>
                )}
                {review.malformedRecords > 0 && (
                  <p>{review.malformedRecords} malformed or unsupported record(s) will be skipped.</p>
                )}
              </div>
            )}
            <p className="field-help">
              Newest events win, including later manual corrections. Existing v1.2 manual progress is attached to each
              detected current profile during this first import.
            </p>
          </div>
          <footer>
            <button className="secondary" onClick={() => void closeLogReview()} disabled={syncBusy}>
              NOT NOW
            </button>
            <button className="primary" onClick={() => void confirmImport()} disabled={syncBusy || !review.available}>
              {syncBusy ? "IMPORTING…" : "IMPORT AND ENABLE MARKERS"}
            </button>
          </footer>
        </Dialog>
      )}

      {open && !reviewOpen && (
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
              {(Object.keys(modeLabels) as QuestGameMode[]).map((value) => (
                <button className={mode === value ? "active" : ""} onClick={() => changeMode(value)} key={value}>
                  {modeLabels[value]}
                </button>
              ))}
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
              <input type="checkbox" checked={showAllMaps} onChange={(event) => setShowAllMaps(event.target.checked)} />{" "}
              All maps
            </label>
            <label className="quest-filter">
              <span>STATUS</span>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
                <option value="all">ALL · ACTIONABLE FIRST</option>
                <option value="actionable">ACTIONABLE ONLY</option>
                <option value="unknown">ELIGIBILITY UNKNOWN</option>
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
          <div className="quest-profile-bar">
            {isTauriRuntime() ? (
              <>
                <label>
                  <span>PROFILE</span>
                  <select
                    value={selectedProfile?.profileKey ?? ""}
                    onChange={(event) => {
                      setSelectedProfileKey(event.target.value || undefined);
                      followDetectedRef.current = false;
                      setFollowDetected(false);
                    }}
                  >
                    {!modeProfiles.length && <option value="">NO DETECTED PROFILE</option>}
                    {modeProfiles.map((profile) => (
                      <option key={profile.profileKey} value={profile.profileKey}>
                        {profileLabel(profile.profileKey)}
                        {profile.isCurrent ? " · CURRENT" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>
                    PLAYER LEVEL{" "}
                    <i title="Optional. Used only for possibly locked/available labels; quest events remain authoritative.">
                      ?
                    </i>
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="79"
                    value={levelDraft}
                    onChange={(event) => setLevelDraft(event.target.value)}
                    placeholder="OPTIONAL"
                  />
                </label>
                <button onClick={() => void savePlayerLevel()} disabled={!selectedProfile}>
                  SAVE LEVEL
                </button>
                <button onClick={followCurrentProfile} disabled={followDetected}>
                  {followDetected ? "FOLLOWING CURRENT" : "FOLLOW CURRENT"}
                </button>
                {syncEnabled ? (
                  <button onClick={() => void pauseAutomaticSync()} disabled={syncBusy}>
                    PAUSE LOG SYNC
                  </button>
                ) : (
                  <button onClick={() => void openLogReview()} disabled={syncBusy}>
                    REVIEW LOG IMPORT
                  </button>
                )}
              </>
            ) : (
              <span>Phone companion progress is manual and stays on this device.</span>
            )}
          </div>
          <div className="quest-result-bar">
            <span>
              {quests.length} QUESTS{syncMessage ? ` · ${syncMessage.toUpperCase()}` : ""}
            </span>
            <b>{showAllMaps ? "ALL LOCATIONS" : mapLabel(mapId).toUpperCase()}</b>
          </div>
          {mode === "pvp-season" && (
            <p className="quest-advisory">
              Seasonal quest eligibility is not reliably present in logs. Unsaved quests stay “eligibility unknown”;
              explicit started/completed/failed events remain authoritative.
            </p>
          )}
          {error && <p className="error-box">{error}</p>}
          <div className="quest-list">
            {quests.map((quest) => {
              const explicit = progressIndex.get(quest.id);
              const status = effectiveQuestStatus(quest, progressIndex, playerLevel, mode);
              const isExpanded = expanded.has(quest.id);
              return (
                <article className={`quest-card ${status}`} key={quest.id}>
                  <header>
                    <button
                      className="quest-expand"
                      onClick={() => toggleExpanded(quest.id)}
                      aria-expanded={isExpanded}
                    >
                      <span>
                        {quest.traderName.toUpperCase()} ·{" "}
                        {quest.minPlayerLevel > 0 ? `LEVEL ${quest.minPlayerLevel}` : "ANY LEVEL"} · CHAIN{" "}
                        {quest.chainDepth + 1}
                      </span>
                      <strong>{quest.name}</strong>
                      <small>{quest.summary}</small>
                    </button>
                    <select
                      value={explicit?.status ?? ""}
                      aria-label={`Status for ${quest.name}`}
                      onChange={(event) => void updateStatus(quest.id, event.target.value as QuestStatus)}
                    >
                      <option value="" disabled>
                        AUTO · {displayStatusLabel(status, false)}
                      </option>
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
                    {explicit?.source && <em>{explicit.source === "logs" ? "LOG" : "MANUAL"}</em>}
                    <i
                      title={
                        explicit
                          ? "Explicit progress event"
                          : "Derived from known prerequisites and optional player level; trader state and other eligibility conditions may be missing."
                      }
                    >
                      {displayStatusLabel(status, Boolean(explicit))}
                    </i>
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
      )}
    </>
  );
}
