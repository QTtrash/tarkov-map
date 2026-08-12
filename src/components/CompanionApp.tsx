import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { maps, getMapDefinition } from "../data/maps";
import { defaultVisiblePoiCategories, loadPoiBundle } from "../poi";
import { createSenderId, decryptPosition, EVICT_AFTER_MS, importRoomKey, parseInvitation } from "../sharing/protocol";
import type { CustomPinPoi, MapPoiBundle, PoiCategory, QuestObjectivePoi, SquadPosition } from "../types";
import { IntelDrawer } from "./IntelDrawer";
import { MapView } from "./MapView";
import { QuestPanel } from "./QuestPanel";

function invitationFromLocation() {
  return `${location.origin}${location.pathname}${location.search}${location.hash}`;
}

function CompanionGate({ state, error }: { state: "encrypting" | "connecting" | "offline" | "invalid"; error: string | null }) {
  const invalid = state === "invalid";
  const title = invalid ? "Invitation cannot be opened" : state === "offline" ? "Relay is out of range" : "Acquiring encrypted room";
  return <main className={`companion-gate ${state}`}>
    <div className="companion-gate__field" aria-hidden="true">
      <svg viewBox="0 0 620 500" preserveAspectRatio="xMidYMid slice">
        <g className="gate-terrain" fill="none">
          <path d="M3 430c95-80 137-28 213-91s133-95 210-50 114 22 190-55" />
          <path d="M0 467c105-88 156-33 237-101s142-104 225-55 118 15 164-38" />
          <path d="M45 357c70-61 116-50 177-88s106-65 172-29 97 24 154-26" />
          <path d="M86 306c59-47 98-38 148-70s88-53 143-24 81 20 128-18" />
        </g>
        <g className="gate-route" fill="none"><path d="M104 376 263 304 359 245 506 196" /><path d="M359 245 498 330" /><circle cx="104" cy="376" r="7" /><circle cx="359" cy="245" r="10" /><circle cx="506" cy="196" r="7" /><circle cx="498" cy="330" r="7" /></g>
      </svg>
      <span>ROOM / KEY LOCAL</span><b>RS</b>
    </div>
    <section><p>RAID SIGNAL / {invalid ? "INVITATION REJECTED" : state === "offline" ? "CONNECTION LOST" : "LOCAL DECRYPTION"}</p><h1>{title}</h1><span>{error ?? (state === "encrypting" ? "The invitation key is being prepared locally on this device." : state === "connecting" ? "The key remains on this device while the encrypted room connection is established." : "The relay did not accept the connection. Check your network or request a fresh invitation.")}</span>{state === "offline" || state === "invalid" ? <a href="https://signal.mouchsiadis-solutions.com/">RETURN TO RAID SIGNAL</a> : null}</section>
  </main>;
}

export function CompanionApp() {
  const [connection, setConnection] = useState<"encrypting" | "connecting" | "online" | "offline" | "invalid">("encrypting");
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
  const [questPoi, setQuestPoi] = useState<QuestObjectivePoi | null>(null);
  const [visible, setVisible] = useState<Set<PoiCategory>>(() => new Set(defaultVisiblePoiCategories));
  const [pins, setPins] = useState<CustomPinPoi[]>(() => {
    try { return JSON.parse(localStorage.getItem("raid-signal-companion-pins") ?? "[]") as CustomPinPoi[]; } catch { return []; }
  });
  const highestSequence = useRef(new Map<string, number>());
  const followRef = useRef(follow);
  const invitationUrl = useRef(invitationFromLocation());

  useEffect(() => { followRef.current = follow; }, [follow]);

  const definition = getMapDefinition(mapId) ?? maps[0];
  const floors = [definition.baseFloor, ...definition.floors.map(({ id, name }) => ({ id, name }))];
  const activeFloor = floor === "base" && definition.baseFloor.id !== "base" ? definition.baseFloor.id : floor;
  const primary = [...positions].filter((position) => position.mapId === definition.id).sort((a, b) => b.receivedAt - a.receivedAt)[0] ?? null;
  const secondaryPositions = primary ? positions.filter((position) => position.senderId !== primary.senderId) : positions;
  const primaryFix = primary ? { observedAt: primary.observedAt, filename: "encrypted-room", position: primary.position, quaternion: null, forward: primary.heading === null ? null : { x: Math.sin(primary.heading * Math.PI / 180), y: 0, z: Math.cos(primary.heading * Math.PI / 180) }, gameTime: null, mapId: primary.mapId, floorId: null } : null;

  useEffect(() => localStorage.setItem("raid-signal-companion-pins", JSON.stringify(pins)), [pins]);

  useEffect(() => {
    let socket: WebSocket | null = null;
    let timeout: number | null = null;
    try {
      const invitation = parseInvitation(invitationUrl.current);
      history.replaceState(null, "", `${location.pathname}${location.search}`);
      void importRoomKey(invitation.rawKey, ["decrypt"]).then((key) => {
        setConnection("connecting");
        socket = new WebSocket(invitation.webSocketUrl);
        socket.binaryType = "arraybuffer";
        timeout = window.setTimeout(() => {
          if (socket?.readyState === WebSocket.CONNECTING) {
            socket.close();
            setConnection("offline");
            setError(invitation.transport === "lan"
              ? "The LAN host did not respond. Confirm this phone is on the same Wi-Fi and that Raid Signal is allowed through Windows Firewall."
              : "The encrypted relay did not respond.");
          }
        }, 10_000);
        socket.onopen = () => {
          if (timeout !== null) window.clearTimeout(timeout);
          timeout = null;
          setConnectedOnce(true);
          setConnection("online");
        };
        socket.onclose = (event) => { setConnection("offline"); if (event.reason) setError(event.reason); };
        socket.onerror = () => setError(invitation.transport === "lan" ? "The encrypted LAN session is unavailable" : "The encrypted relay is unavailable");
        socket.onmessage = (event) => {
          void decryptPosition(key, invitation.roomId, event.data).then((position) => {
            const highest = highestSequence.current.get(position.senderId) ?? 0;
            if (position.sequence <= highest) return;
            highestSequence.current.set(position.senderId, position.sequence);
            setPositions((current) => [...current.filter((item) => item.senderId !== position.senderId), position]);
            if (followRef.current) setMapId(position.mapId);
          }).catch(() => undefined);
        };
      }).catch((reason) => { setConnection("invalid"); setError(reason instanceof Error ? reason.message : String(reason)); });
    } catch (reason) {
      setConnection("invalid");
      setError(reason instanceof Error ? reason.message : String(reason));
    }
    return () => {
      if (timeout !== null) window.clearTimeout(timeout);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setPositions((current) => current.filter((position) => Date.now() - position.receivedAt < EVICT_AFTER_MS)), 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPoiBundle(null);
    setPoiError(null);
    void loadPoiBundle(definition.poiPath, controller.signal).then(setPoiBundle).catch((reason) => { if (!controller.signal.aborted) setPoiError(String(reason)); });
    return () => controller.abort();
  }, [definition.poiPath]);

  const renderedBundle = useMemo<MapPoiBundle | null>(() => poiBundle ? {
    ...poiBundle,
    pois: [...poiBundle.pois.filter((poi) => poi.category !== "quest-objective" && poi.category !== "custom-pin"), ...(questPoi ? [questPoi] : []), ...pins.filter((pin) => pin.id.startsWith(`pin-${definition.id}-`))],
  } : null, [definition.id, pins, poiBundle, questPoi]);
  const renderedVisible = useMemo(() => new Set<PoiCategory>([...visible, ...(questPoi ? ["quest-objective" as const] : []), ...(pins.length ? ["custom-pin" as const] : [])]), [pins.length, questPoi, visible]);

  const selectMap = useCallback((nextMapId: string) => { setFollow(false); setMapId(nextMapId); setFloor("base"); setQuestPoi(null); }, []);
  const focusQuest = useCallback((nextMapId: string, poi: QuestObjectivePoi | null) => { selectMap(nextMapId); setQuestPoi(poi); setFocusPoiId(poi?.id ?? null); setQuestsOpen(false); }, [selectMap]);
  const createPin = useCallback((position: { x: number; z: number }) => setPins((current) => [...current, { id: `pin-${definition.id}-${createSenderId()}`, kind: "custom-pin", category: "custom-pin", name: "Companion waypoint", note: "Saved on this phone", position: { x: position.x, y: 0, z: position.z } }]), [definition.id]);

  if (connection === "invalid" || (connection !== "online" && !connectedOnce)) return <CompanionGate state={connection} error={error} />;

  return <main className="companion-shell">
    <header className="companion-header"><div className="companion-brand"><b>RS</b><span><strong>RAID SIGNAL</strong><small>ENCRYPTED SQUAD COMPANION</small></span></div><span className={`companion-state ${connection}`}><i />{connection.toUpperCase()}</span><button onClick={() => setQuestsOpen(true)}>QUESTS</button><button onClick={() => setIntelOpen(!intelOpen)}>INTEL</button></header>
    <section className="companion-controls"><label><span>MAP</span><select value={definition.id} onChange={(event) => selectMap(event.target.value)}>{maps.map((map) => <option value={map.id} key={map.id}>{map.displayName}</option>)}</select></label><label><span>LEVEL</span><select value={activeFloor} onChange={(event) => setFloor(event.target.value)}>{floors.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className={follow ? "active" : ""} onClick={() => { setFollow(true); const newest = [...positions].sort((a, b) => b.receivedAt - a.receivedAt)[0]; if (newest) setMapId(newest.mapId); }}>FOLLOW SQUAD</button></section>
    <section className="companion-map">
      {error && connection !== "online" && <p className="companion-connection-error">{error}</p>}
      <MapView definition={definition} activeFloor={activeFloor} fix={primaryFix} squadPositions={secondaryPositions} follow={follow} poiBundle={renderedBundle} visiblePoiCategories={renderedVisible} selectedPoiId={selectedPoiId} focusPoiId={focusPoiId} onFollowChange={setFollow} onSelectPoi={setSelectedPoiId} onCreateWaypoint={createPin} />
      <div className="companion-roster"><span>{positions.length} SIGNAL{positions.length === 1 ? "" : "S"}</span>{positions.map((position) => <button key={position.senderId} onClick={() => { setMapId(position.mapId); setFollow(false); }}><b>{position.nickname}</b><small>{getMapDefinition(position.mapId)?.displayName ?? position.mapId} · {Math.floor((Date.now() - position.receivedAt) / 1000)}s</small></button>)}</div>
      <IntelDrawer definition={definition} bundle={renderedBundle} loading={!poiBundle && !poiError} error={poiError} open={intelOpen} visible={visible} fix={primaryFix} onOpenChange={setIntelOpen} onToggle={(category) => setVisible((current) => { const next = new Set(current); if (next.has(category)) next.delete(category); else next.add(category); return next; })} onSetVisible={(categories) => setVisible(new Set(categories))} onFocusPoi={(id) => { setSelectedPoiId(id); setFocusPoiId(id); }} />
    </section>
    <QuestPanel open={questsOpen} mapId={definition.id} onClose={() => setQuestsOpen(false)} onFocusObjective={focusQuest} />
  </main>;
}
