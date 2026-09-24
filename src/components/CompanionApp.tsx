import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { maps, getMapDefinition } from "../data/maps";
import { allLootGroupIds, defaultVisiblePoiCategories, loadPoiBundle, lootGroupForType } from "../poi";
import { chooseAutomaticFloor } from "../floor";
import {
  companionPinsKey,
  maxCompanionPins,
  persistCompanionWaypoints,
  removeCompanionWaypoints,
} from "../companion-waypoints";
import { composePoiBundle, composeVisibleCategories, pinsForMap } from "../map-overlays";
import { createSenderId, decryptPosition, EVICT_AFTER_MS, importRoomKey, parseInvitation } from "../sharing/protocol";
import type {
  CustomPinPoi,
  LootGroupId,
  MapPoiBundle,
  PoiCategory,
  QuestGameMode,
  QuestObjectivePoi,
  SquadPosition,
} from "../types";
import { IntelDrawer } from "./IntelDrawer";
import { MapView } from "./MapView";
import { QuestPanel } from "./QuestPanel";
import { parseCustomPins, readStoredJson } from "../validation";

function invitationFromLocation() {
  return `${location.origin}${location.pathname}${location.search}${location.hash}`;
}

function CompanionGate({
  state,
  error,
}: {
  state: "encrypting" | "connecting" | "offline" | "invalid";
  error: string | null;
}) {
  const invalid = state === "invalid";
  const title = invalid
    ? "Invitation cannot be opened"
    : state === "offline"
      ? "Relay is out of range"
      : "Acquiring encrypted room";
  return (
    <main className={`companion-gate ${state}`}>
      <div className="companion-gate__field" aria-hidden="true">
        <svg viewBox="0 0 620 500" preserveAspectRatio="xMidYMid slice">
          <g className="gate-terrain" fill="none">
            <path d="M3 430c95-80 137-28 213-91s133-95 210-50 114 22 190-55" />
            <path d="M0 467c105-88 156-33 237-101s142-104 225-55 118 15 164-38" />
            <path d="M45 357c70-61 116-50 177-88s106-65 172-29 97 24 154-26" />
            <path d="M86 306c59-47 98-38 148-70s88-53 143-24 81 20 128-18" />
          </g>
          <g className="gate-route" fill="none">
            <path d="M104 376 263 304 359 245 506 196" />
            <path d="M359 245 498 330" />
            <circle cx="104" cy="376" r="7" />
            <circle cx="359" cy="245" r="10" />
            <circle cx="506" cy="196" r="7" />
            <circle cx="498" cy="330" r="7" />
          </g>
        </svg>
        <span>ROOM / KEY LOCAL</span>
        <b>RS</b>
      </div>
      <section>
        <p>
          RAID SIGNAL / {invalid ? "INVITATION REJECTED" : state === "offline" ? "CONNECTION LOST" : "LOCAL DECRYPTION"}
        </p>
        <h1>{title}</h1>
        <span>
          {error ??
            (state === "encrypting"
              ? "The invitation key is being prepared locally on this device."
              : state === "connecting"
                ? "The key remains on this device while the encrypted room connection is established."
                : "The relay did not accept the connection. Check your network or request a fresh invitation.")}
        </span>
        {state === "offline" || state === "invalid" ? (
          <a href="https://signal.mouchsiadis-solutions.com/">RETURN TO RAID SIGNAL</a>
        ) : null}
      </section>
    </main>
  );
}

export function CompanionApp() {
  const [connection, setConnection] = useState<"encrypting" | "connecting" | "online" | "offline" | "invalid">(
    "encrypting",
  );
  const [connectedOnce, setConnectedOnce] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mapId, setMapId] = useState("customs");
  const [floor, setFloor] = useState("base");
  const [follow, setFollow] = useState(true);
  const [intelOpen, setIntelOpen] = useState(false);
  const [questsOpen, setQuestsOpen] = useState(false);
  const [positions, setPositions] = useState<SquadPosition[]>([]);
  const [poiBundle, setPoiBundle] = useState<MapPoiBundle | null>(null);
  const [poiError, setPoiError] = useState<string | null>(null);
  const [selectedPoiId, setSelectedPoiId] = useState<string | null>(null);
  const [focusPoiId, setFocusPoiId] = useState<string | null>(null);
  const [questMode, setQuestMode] = useState<QuestGameMode>("regular");
  const focusHandled = useCallback(() => setFocusPoiId(null), []);
  const [activeQuestPois, setActiveQuestPois] = useState<QuestObjectivePoi[]>([]);
  const [focusedQuestPoi, setFocusedQuestPoi] = useState<QuestObjectivePoi | null>(null);
  const [visible, setVisible] = useState<Set<PoiCategory>>(() => new Set(defaultVisiblePoiCategories));
  const [visibleLootGroups, setVisibleLootGroups] = useState<Set<LootGroupId>>(() => new Set(allLootGroupIds));
  const [showQuestMarkers, setShowQuestMarkers] = useState(false);
  const [pins, setPins] = useState<CustomPinPoi[]>(() => readStoredJson(companionPinsKey, parseCustomPins, []));
  const pinsRef = useRef(pins);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const updatePins = useCallback((next: CustomPinPoi[]) => {
    pinsRef.current = next;
    setPins(next);
    setPinMessage(
      persistCompanionWaypoints(next)
        ? "Waypoints saved on this phone."
        : "Changes are visible but could not be saved. Phone storage is unavailable or full.",
    );
  }, []);
  const highestSequence = useRef(new Map<string, number>());
  const followRef = useRef(follow);
  const invitationUrl = useRef(invitationFromLocation());

  useEffect(() => {
    followRef.current = follow;
  }, [follow]);

  const definition = getMapDefinition(mapId) ?? maps[0];
  const floors = [definition.baseFloor, ...definition.floors.map(({ id, name }) => ({ id, name }))];
  const activeFloor = floor === "base" && definition.baseFloor.id !== "base" ? definition.baseFloor.id : floor;
  const primary =
    [...positions]
      .filter((position) => position.mapId === definition.id)
      .sort((a, b) => b.receivedAt - a.receivedAt)[0] ?? null;
  const secondaryPositions = primary
    ? positions.filter((position) => position.senderId !== primary.senderId)
    : positions;
  const primaryFix = primary
    ? {
        observedAt: primary.observedAt,
        filename: "encrypted-room",
        position: primary.position,
        quaternion: null,
        forward:
          primary.heading === null
            ? null
            : { x: Math.sin((primary.heading * Math.PI) / 180), y: 0, z: Math.cos((primary.heading * Math.PI) / 180) },
        gameTime: null,
        mapId: primary.mapId,
        floorId: null,
      }
    : null;

  const mapPins = useMemo(() => pinsForMap(pins, definition.id), [pins, definition.id]);
  const deletableWaypointIds = useMemo(() => new Set(mapPins.map((pin) => pin.id)), [mapPins]);
  const removePins = useCallback(
    (id?: string) => {
      const result = removeCompanionWaypoints(pinsRef.current, definition.id, id);
      if (!result.removed.size) return;
      setSelectedPoiId((current) => (current && result.removed.has(current) ? null : current));
      setFocusPoiId((current) => (current && result.removed.has(current) ? null : current));
      updatePins(result.pins);
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".companion-map .map-canvas")?.focus());
    },
    [definition.id, updatePins],
  );

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timeout: number | null = null;
    let retryTimer: number | null = null;
    let disposed = false;
    let retryAttempt = 0;
    try {
      const invitation = parseInvitation(invitationUrl.current);
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      void importRoomKey(invitation.rawKey, ["decrypt"])
        .then((key) => {
          const connect = () => {
            if (disposed) return;
            setConnection("connecting");
            const candidate = new WebSocket(invitation.webSocketUrl);
            socket = candidate;
            candidate.binaryType = "arraybuffer";
            timeout = window.setTimeout(() => {
              if (candidate.readyState === WebSocket.CONNECTING) candidate.close(4000, "Connection timed out");
            }, 10_000);
            candidate.onopen = () => {
              if (timeout !== null) window.clearTimeout(timeout);
              timeout = null;
              retryAttempt = 0;
              setError(null);
              setConnectedOnce(true);
              setConnection("online");
            };
            candidate.onclose = (event) => {
              if (timeout !== null) window.clearTimeout(timeout);
              timeout = null;
              if (disposed) return;
              setConnection("offline");
              if (event.code === 1000 && /expired/i.test(event.reason)) {
                setError(event.reason || "This invitation has expired");
                return;
              }
              const delay = Math.min(30_000, 1_000 * 2 ** retryAttempt);
              retryAttempt += 1;
              setError(`${event.reason || "Connection lost"}. Reconnecting in ${Math.ceil(delay / 1000)}s.`);
              retryTimer = window.setTimeout(connect, delay);
            };
            candidate.onerror = () =>
              setError(
                invitation.transport === "lan"
                  ? "The encrypted LAN session is unavailable"
                  : "The encrypted relay is unavailable",
              );
            candidate.onmessage = (event) => {
              void decryptPosition(key, invitation.roomId, event.data)
                .then((position) => {
                  const highest = highestSequence.current.get(position.senderId) ?? 0;
                  if (position.sequence <= highest) return;
                  highestSequence.current.set(position.senderId, position.sequence);
                  setPositions((current) => [
                    ...current.filter((item) => item.senderId !== position.senderId),
                    position,
                  ]);
                  if (followRef.current) setMapId(position.mapId);
                })
                .catch(() => undefined);
            };
          };
          connect();
        })
        .catch((reason) => {
          setConnection("invalid");
          setError(reason instanceof Error ? reason.message : String(reason));
        });
    } catch (reason) {
      setConnection("invalid");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    return () => {
      disposed = true;
      if (timeout !== null) window.clearTimeout(timeout);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setPositions((current) => current.filter((position) => Date.now() - position.receivedAt < EVICT_AFTER_MS)),
      5_000,
    );
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPoiBundle(null);
    setPoiError(null);
    void loadPoiBundle(definition.poiPath, controller.signal)
      .then(setPoiBundle)
      .catch((reason) => {
        if (!controller.signal.aborted) setPoiError(String(reason));
      });
    return () => controller.abort();
  }, [definition.poiPath]);

  const renderedBundle = useMemo<MapPoiBundle | null>(
    () => composePoiBundle(poiBundle, definition.id, activeQuestPois, focusedQuestPoi, pins, showQuestMarkers),
    [activeQuestPois, definition.id, focusedQuestPoi, pins, poiBundle, showQuestMarkers],
  );
  const renderedVisible = useMemo(
    () => composeVisibleCategories(visible, definition.id, activeQuestPois, focusedQuestPoi, pins, showQuestMarkers),
    [activeQuestPois, definition.id, focusedQuestPoi, pins, showQuestMarkers, visible],
  );

  const selectMap = useCallback((nextMapId: string) => {
    setFollow(false);
    setMapId(nextMapId);
    setFloor("base");
    setFocusedQuestPoi(null);
    setSelectedPoiId(null);
    setFocusPoiId(null);
  }, []);
  const focusQuest = useCallback(
    (nextMapId: string, poi: QuestObjectivePoi | null) => {
      selectMap(nextMapId);
      setFocusedQuestPoi(poi);
      if (poi) {
        setShowQuestMarkers(true);
        const target = getMapDefinition(nextMapId);
        if (target) setFloor(chooseAutomaticFloor(target, poi.position));
      }
      setFocusPoiId(poi?.id ?? null);
      setQuestsOpen(false);
    },
    [selectMap],
  );
  const createPin = useCallback(
    (position: { x: number; z: number }) => {
      if (pinsRef.current.length >= maxCompanionPins) {
        setPinMessage("Waypoint limit reached (500). Delete or clear waypoints before adding another.");
        return;
      }
      const pin: CustomPinPoi = {
        id: `pin-${definition.id}-${createSenderId()}`,
        kind: "custom-pin",
        category: "custom-pin",
        name: "Companion waypoint",
        note: "Saved on this phone",
        position: { x: position.x, y: 0, z: position.z },
      };
      try {
        parseCustomPins([pin]);
      } catch {
        setPinMessage("This waypoint position is invalid.");
        return;
      }
      updatePins([...pinsRef.current, pin]);
    },
    [definition.id, updatePins],
  );
  const toggleCategory = useCallback((category: PoiCategory) => {
    setVisible((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else {
        next.add(category);
        if (category === "loot") {
          setVisibleLootGroups((groups) => (groups.size ? groups : new Set(allLootGroupIds)));
        }
      }
      return next;
    });
  }, []);
  const toggleLootGroup = useCallback(
    (group: LootGroupId) => {
      if (!visible.has("loot")) {
        setVisibleLootGroups(new Set([group]));
        setVisible((categories) => new Set(categories).add("loot"));
        return;
      }
      setVisibleLootGroups((current) => {
        const next = new Set(current);
        if (next.has(group)) next.delete(group);
        else next.add(group);
        setVisible((categories) => {
          const nextCategories = new Set(categories);
          if (next.size) nextCategories.add("loot");
          else nextCategories.delete("loot");
          return nextCategories;
        });
        return next;
      });
    },
    [visible],
  );

  if (connection === "invalid" || (connection !== "online" && !connectedOnce))
    return <CompanionGate state={connection} error={error} />;

  return (
    <main className="companion-shell">
      <header className="companion-header">
        <div className="companion-brand">
          <b>RS</b>
          <span>
            <strong>RAID SIGNAL</strong>
            <small>ENCRYPTED SQUAD COMPANION</small>
          </span>
        </div>
        <span className={`companion-state ${connection}`}>
          <i />
          {connection.toUpperCase()}
        </span>
        <button onClick={() => setQuestsOpen(true)}>QUESTS</button>
        <button onClick={() => setIntelOpen(!intelOpen)}>INTEL</button>
      </header>
      <section className="companion-controls">
        <label>
          <span>MAP</span>
          <select aria-label="Map" value={definition.id} onChange={(event) => selectMap(event.target.value)}>
            {maps.map((map) => (
              <option value={map.id} key={map.id}>
                {map.displayName}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>LEVEL</span>
          <select aria-label="Floor" value={activeFloor} onChange={(event) => setFloor(event.target.value)}>
            {floors.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className={follow ? "active" : ""}
          onClick={() => {
            setFollow(true);
            const newest = [...positions].sort((a, b) => b.receivedAt - a.receivedAt)[0];
            if (newest) setMapId(newest.mapId);
          }}
        >
          FOLLOW SQUAD
        </button>
      </section>
      <section className="companion-map">
        {error && connection !== "online" && <p className="companion-connection-error">{error}</p>}
        <MapView
          key={definition.id}
          definition={definition}
          activeFloor={activeFloor}
          fix={primaryFix}
          squadPositions={secondaryPositions}
          follow={follow}
          poiBundle={renderedBundle}
          visiblePoiCategories={renderedVisible}
          visibleLootGroups={visibleLootGroups}
          selectedPoiId={selectedPoiId}
          focusPoiId={focusPoiId}
          onFocusHandled={focusHandled}
          questMode={questMode}
          onDeleteWaypoint={removePins}
          deletableWaypointIds={deletableWaypointIds}
          onFollowChange={setFollow}
          onSelectPoi={setSelectedPoiId}
          onCreateWaypoint={createPin}
        />
        <div className="companion-roster">
          <span>
            {positions.length} SIGNAL{positions.length === 1 ? "" : "S"}
          </span>
          {positions.map((position) => (
            <button
              key={position.senderId}
              onClick={() => {
                setMapId(position.mapId);
                setFollow(false);
              }}
            >
              <b>{position.nickname}</b>
              <small>
                {getMapDefinition(position.mapId)?.displayName ?? position.mapId} ·{" "}
                {Math.floor((Date.now() - position.receivedAt) / 1000)}s
              </small>
            </button>
          ))}
        </div>
        <IntelDrawer
          definition={definition}
          bundle={renderedBundle}
          loading={!poiBundle && !poiError}
          error={poiError}
          open={intelOpen}
          visible={visible}
          visibleLootGroups={visibleLootGroups}
          fix={primaryFix}
          showQuestMarkers={showQuestMarkers}
          activeQuestCount={activeQuestPois.filter((poi) => poi.mapId === definition.id).length}
          onOpenChange={setIntelOpen}
          onToggle={toggleCategory}
          onToggleLootGroup={toggleLootGroup}
          onToggleQuestMarkers={() => setShowQuestMarkers((current) => !current)}
          onHideAll={() => {
            setVisible(new Set());
            setFocusedQuestPoi(null);
            setShowQuestMarkers(false);
          }}
          onSetVisible={(categories) => setVisible(new Set(categories))}
          onFocusPoi={(id) => {
            const poi = renderedBundle?.pois.find((candidate) => candidate.id === id);
            if (poi) setVisible((current) => new Set(current).add(poi.category));
            if (poi?.kind === "loot") {
              setVisibleLootGroups((current) => new Set(current).add(lootGroupForType(poi.lootType)));
            }
            setSelectedPoiId(id);
            setFocusPoiId(id);
          }}
        />
      </section>
      <footer className="companion-waypoint-controls">
        <button onClick={() => removePins()} disabled={!mapPins.length}>
          Clear waypoints on this map
        </button>
        <span>
          {definition.displayName} · {mapPins.length} saved
        </span>
        {pinMessage && <p role="status">{pinMessage}</p>}
      </footer>
      <QuestPanel
        open={questsOpen}
        mapId={definition.id}
        onClose={() => setQuestsOpen(false)}
        onFocusObjective={focusQuest}
        onActiveObjectivePoisChange={setActiveQuestPois}
        onCatalogModeChange={setQuestMode}
      />
    </main>
  );
}
