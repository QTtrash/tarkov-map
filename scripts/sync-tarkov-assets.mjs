import { createHash } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const finalPublicMaps = path.join(root, "public", "maps");
const stagingPublicMaps = path.join(root, "public", `.maps-staging-${process.pid}`);
const backupPublicMaps = path.join(root, "public", `.maps-backup-${process.pid}`);
const generatedPath = path.join(root, "src", "data", "maps.generated.json");
const mapsUrl = "https://raw.githubusercontent.com/the-hideout/tarkov-dev/main/src/data/maps.json";
const poiUrl = "https://json.tarkov.dev/regular/maps";
const poiTranslationsUrl = "https://json.tarkov.dev/regular/maps_en";
const questUrls = {
  regular: ["https://json.tarkov.dev/regular/tasks", "https://json.tarkov.dev/regular/tasks_en"],
  pve: ["https://json.tarkov.dev/pve/tasks", "https://json.tarkov.dev/pve/tasks_en"],
  "pvp-season": ["https://json.tarkov.dev/pvp-season/tasks", "https://json.tarkov.dev/pvp-season/tasks_en"],
};
const itemUrls = ["https://json.tarkov.dev/regular/items", "https://json.tarkov.dev/regular/items_en"];
const traderUrls = ["https://json.tarkov.dev/regular/traders", "https://json.tarkov.dev/regular/traders_en"];
const svgBase = "https://raw.githubusercontent.com/the-hideout/tarkov-dev-svg-maps/main";
const licenseUrl = `${svgBase}/LICENSE.md`;
const communityRasterMaps = {
  icebreaker: {
    url: "https://reemr.se/maps/Icebreaker/re3mrIcebreaker.png",
    filename: "Icebreaker-re3mr.png",
    author: "RE3MR",
    authorLink: "https://reemr.se/",
  },
  "the-labyrinth": {
    url: "https://www.re3mr.com/maps/Labyrinth/re3mrLabyrinthPNG.png",
    filename: "Labyrinth-re3mr.png",
    author: "RE3MR",
    authorLink: "https://reemr.se/",
  },
};
const displayNames = {
  "streets-of-tarkov": "Streets of Tarkov",
  "ground-zero": "Ground Zero",
  customs: "Customs",
  factory: "Factory",
  icebreaker: "Icebreaker",
  interchange: "Interchange",
  "the-lab": "The Lab",
  "the-labyrinth": "The Labyrinth",
  lighthouse: "Lighthouse",
  reserve: "Reserve",
  shoreline: "Shoreline",
  terminal: "Terminal",
  woods: "Woods",
};
const aliases = {
  "streets-of-tarkov": ["tarkovstreets", "streets"],
  "ground-zero": ["sandbox", "sandbox_high", "groundzero"],
  customs: ["bigmap"],
  factory: ["factory4_day", "factory4_night"],
  icebreaker: ["icebreaker"],
  interchange: ["interchange"],
  "the-lab": ["laboratory", "lab"],
  "the-labyrinth": ["labyrinth"],
  lighthouse: ["lighthouse"],
  reserve: ["rezervbase"],
  shoreline: ["shoreline"],
  terminal: ["terminal"],
  woods: ["woods"],
};
const labSvg = { url: `${svgBase}/Labs.svg`, filename: "Labs.svg", baseLayer: "First_Level" };

async function exists(target) {
  return access(target)
    .then(() => true)
    .catch(() => false);
}

async function fetchRequired(url) {
  const response = await fetch(url, { headers: { "user-agent": "tarkov-map-locator-asset-sync" } });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

async function fetchJson(url) {
  return (await fetchRequired(url)).json();
}

async function writeBytes(bytes, destination) {
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, bytes);
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(value, destination) {
  return writeBytes(Buffer.from(`${JSON.stringify(value, null, 2)}\n`), destination);
}

async function writeResponse(url, destination) {
  const bytes = new Uint8Array(await (await fetchRequired(url)).arrayBuffer());
  return writeBytes(bytes, destination);
}

function safeLayerId(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "base"
  );
}

function normalizeFloor(layer, index, asset) {
  return {
    id: layer.svgLayer || safeLayerId(layer.name || `floor-${index + 1}`),
    name: layer.name || `Floor ${index + 1}`,
    svgLayer: layer.svgLayer || null,
    extents: layer.extents || [],
    asset,
  };
}

function vector(value) {
  return { x: Number(value?.x ?? 0), y: Number(value?.y ?? 0), z: Number(value?.z ?? 0) };
}

function translated(value, dictionary, fallback) {
  return dictionary[value] || fallback || value || "Unknown";
}

function canonicalMapId(mapId) {
  return (
    {
      "ground-zero-21": "ground-zero",
      "ground-zero-tutorial": "ground-zero",
      "night-factory": "factory",
      "the-lab-dark": "the-lab",
    }[mapId] || mapId
  );
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function spawnCategory(spawn) {
  if (spawn.categories?.includes("boss")) return "spawn-boss";
  if (spawn.categories?.includes("sniper")) return "spawn-sniper";
  if (spawn.categories?.includes("player") && spawn.sides?.some((side) => side === "pmc" || side === "all")) {
    return "spawn-pmc";
  }
  if (spawn.sides?.includes("scav")) return "spawn-scav";
  return "spawn-other";
}

function normalizePois(mapId, apiMap, apiData, dictionary) {
  const pois = [];
  const generatedAt = new Date().toISOString();
  if (!apiMap) return { schemaVersion: 2, mapId, generatedAt, sources: [poiUrl], pois };

  for (const extract of apiMap.extracts || []) {
    const faction = extract.faction || "shared";
    pois.push({
      id: extract.id,
      kind: "extract",
      category: `extract-${faction}`,
      name: translated(extract.name, dictionary, "Extract"),
      aliases: [...new Set([extract.name, translated(extract.name, dictionary, "")].filter(Boolean))],
      position: vector(extract.position),
      outline: (extract.outline || []).map(vector),
      top: extract.top ?? null,
      bottom: extract.bottom ?? null,
      faction,
      switchIds: extract.switches || (extract.switch ? [extract.switch] : []),
      transferItem: extract.transferItem
        ? {
            itemId: extract.transferItem.item,
            count: Number(extract.transferItem.count || 0),
          }
        : null,
    });
  }
  for (const transit of apiMap.transits || []) {
    pois.push({
      id: `transit-${transit.id}`,
      sourceId: transit.id,
      kind: "transit",
      category: "transit",
      name: translated(transit.description, dictionary, "Transit"),
      position: vector(transit.position),
      outline: (transit.outline || []).map(vector),
      top: transit.top ?? null,
      bottom: transit.bottom ?? null,
    });
  }
  for (const sw of apiMap.switches || []) {
    pois.push({
      id: sw.id,
      kind: "switch",
      category: "switch",
      name: translated(sw.name, dictionary, "Activation switch"),
      position: vector(sw.position),
      outline: (sw.outline || []).map(vector),
      top: sw.top ?? null,
      bottom: sw.bottom ?? null,
      activates: (sw.activates || [])
        .map((operation) => ({
          operation: operation.operation || "Activates",
          targetId: operation.extract || operation.switch || null,
          targetKind: operation.extract ? "extract" : "switch",
        }))
        .filter((operation) => operation.targetId),
    });
  }
  for (const hazard of apiMap.hazards || []) {
    pois.push({
      id: hazard.id,
      kind: "hazard",
      category: "hazard",
      name: translated(hazard.name, dictionary, "Hazard"),
      position: vector(hazard.position),
      outline: (hazard.outline || []).map(vector),
      top: hazard.top ?? null,
      bottom: hazard.bottom ?? null,
      hazardType: hazard.hazardType || "danger",
    });
  }
  for (const [index, zone] of (apiMap.artillery?.zones || []).entries()) {
    pois.push({
      id: `artillery-${index}`,
      kind: "hazard",
      category: "hazard",
      name: "Mortar danger zone",
      position: vector(zone.position),
      outline: (zone.outline || []).map(vector),
      top: zone.top ?? null,
      bottom: zone.bottom ?? null,
      hazardType: "mortar",
    });
  }
  for (const [index, stop] of (apiMap.btrStops || []).entries()) {
    pois.push({
      id: `btr-${index}`,
      kind: "btr",
      category: "btr",
      name: translated(stop.name, dictionary, "BTR stop"),
      position: vector(stop),
    });
  }
  for (const [index, spawn] of (apiMap.spawns || []).entries()) {
    const category = spawnCategory(spawn);
    if (category === "spawn-boss") continue;
    const labels = {
      "spawn-pmc": "PMC spawn",
      "spawn-scav": "Scav spawn",
      "spawn-boss": "Boss spawn",
      "spawn-sniper": "Sniper Scav spawn",
      "spawn-other": "Combatant spawn",
    };
    pois.push({
      id: `spawn-${index}`,
      kind: "spawn",
      category,
      name: labels[category],
      position: vector(spawn.position),
      zoneName: spawn.zoneName || null,
      sides: spawn.sides || [],
    });
  }
  for (const boss of apiMap.bosses || []) {
    const bossName = translated(apiData.mobs?.[boss.mob]?.name, dictionary, boss.mob || "Boss");
    for (const [index, location] of (boss.spawnLocations || []).entries()) {
      const positions = location.positions || [];
      if (!positions.length) continue;
      const position = positions.reduce(
        (sum, point) => ({
          x: sum.x + Number(point.x || 0) / positions.length,
          y: sum.y + Number(point.y || 0) / positions.length,
          z: sum.z + Number(point.z || 0) / positions.length,
        }),
        { x: 0, y: 0, z: 0 },
      );
      pois.push({
        id: `boss-${boss.mob}-${index}`,
        kind: "boss-zone",
        category: "boss-zone",
        name: `${bossName} · ${translated(location.name, dictionary, location.name || "Spawn zone")}`,
        aliases: [boss.mob, location.name].filter(Boolean),
        position,
        bossId: boss.mob,
        bossName,
        spawnChance: Number(boss.spawnChance || 0),
        zoneChance: Number(location.chance || 0),
      });
    }
  }
  for (const lock of apiMap.locks || []) {
    pois.push({
      id: `lock-${lock.id}`,
      kind: "locked-door",
      category: "locked-door",
      name: lock.needsPower ? "Powered locked access" : "Locked access",
      aliases: [lock.lockType, lock.key].filter(Boolean),
      position: vector(lock.position),
      outline: (lock.outline || []).map(vector),
      top: lock.top ?? null,
      bottom: lock.bottom ?? null,
      keyIds: [lock.key].filter(Boolean),
    });
  }
  for (const [index, loot] of (apiMap.lootContainers || []).entries()) {
    const container = apiData.lootContainers?.[loot.lootContainer];
    pois.push({
      id: `loot-${index}`,
      kind: "loot",
      category: "loot",
      name: translated(container?.name, dictionary, "Loot container"),
      position: vector(loot.position),
      lootType: container?.normalizedName || loot.lootContainer,
    });
  }
  for (const [index, weapon] of (apiMap.stationaryWeapons || []).entries()) {
    const definition = apiData.stationaryWeapons?.[weapon.stationaryWeapon];
    pois.push({
      id: `weapon-${index}`,
      kind: "stationary-weapon",
      category: "stationary-weapon",
      name: translated(definition?.name, dictionary, "Stationary weapon"),
      position: vector(weapon.position),
    });
  }
  return { schemaVersion: 2, mapId, generatedAt, sources: [poiUrl, poiTranslationsUrl], pois };
}

function normalizeQuestBundle(
  gameMode,
  raw,
  translations,
  mapIds,
  itemData,
  itemTranslations,
  traderData,
  traderTranslations,
) {
  const dictionary = translations.data || {};
  const tasks = Object.values(raw.data?.tasks || {});
  const items = itemData.data?.items || {};
  const itemDictionary = itemTranslations.data || {};
  const traders = traderData.data || {};
  const traderDictionary = traderTranslations.data || {};
  const mapName = (id) => canonicalMapId(mapIds.get(id) || id || "");
  const itemName = (id) =>
    translated(items[id]?.name, itemDictionary, items[id]?.normalizedName?.replaceAll("-", " ") || id);
  const traderName = (id) =>
    translated(traders[id]?.name, traderDictionary, traders[id]?.normalizedName || "Unknown trader");
  const quests = tasks.map((task) => {
    const objectives = (task.objectives || []).map((objective) => {
      const zones = (objective.zones || [])
        .map((zone) => ({
          mapId: mapName(zone.map),
          position: vector(zone.position),
          outline: (zone.outline || []).map(vector),
          top: zone.top ?? null,
          bottom: zone.bottom ?? null,
        }))
        .filter((zone) => zone.mapId);
      // Find-item objectives carry candidate spawn points here instead of zones.
      const possibleLocationsByMap = new Map();
      for (const location of objective.possibleLocations || []) {
        const mapId = mapName(location.map);
        if (!mapId) continue;
        const entry = possibleLocationsByMap.get(mapId) || { mapId, positions: [], positionKeys: new Set() };
        for (const position of (location.positions || []).map(vector)) {
          const key = `${position.x}\u0000${position.y}\u0000${position.z}`;
          if (entry.positionKeys.has(key)) continue;
          entry.positionKeys.add(key);
          entry.positions.push(position);
        }
        possibleLocationsByMap.set(mapId, entry);
      }
      const possibleLocations = [...possibleLocationsByMap.values()]
        .filter((location) => location.positions.length)
        .map(({ mapId, positions }) => ({ mapId, positions }));
      const objectiveMapIds = unique([
        ...(objective.maps || []).map(mapName),
        ...zones.map((zone) => zone.mapId),
        ...possibleLocations.map((location) => location.mapId),
      ]);
      const objectiveItems = (objective.items || []).map(itemName);
      const details = [];
      if (Number(objective.count || 0) > 1) details.push(`Required count: ${Number(objective.count)}`);
      if (objective.foundInRaid) details.push("Items must have Found in Raid status");
      if (objectiveItems.length === 1) details.push(`Required item: ${objectiveItems[0]}`);
      else if (objectiveItems.length > 1 && objectiveItems.length <= 4)
        details.push(`Accepted items: ${objectiveItems.join(", ")}`);
      else if (objectiveItems.length > 4) details.push(`${objectiveItems.length} accepted item types`);
      if (objective.targetNames?.length)
        details.push(`Targets: ${objective.targetNames.map((name) => translated(name, dictionary, name)).join(", ")}`);
      if (Number(objective.distance?.value || 0) > 0)
        details.push(`Distance: ${objective.distance.compareMethod || ">="} ${objective.distance.value} m`);
      if (objective.optional) details.push("Optional objective");
      return {
        id: objective.id,
        description: translated(objective.description, dictionary, "Objective"),
        type: objective.type || "unknown",
        optional: Boolean(objective.optional),
        mapIds: objectiveMapIds,
        details,
        zones,
        possibleLocations,
      };
    });
    const declaredMap = mapName(task.map);
    const objectiveMaps = objectives.flatMap((objective) => objective.mapIds);
    const mapIdsForQuest = unique([declaredMap, ...objectiveMaps]);
    const experience = Number(task.experience || 0);
    const rewardSummary = [];
    if (experience > 0) rewardSummary.push(`${experience.toLocaleString("en-US")} XP`);
    for (const reward of (task.finishRewards?.items || []).slice(0, 4)) {
      rewardSummary.push(`${Number(reward.count || 1).toLocaleString("en-US")} × ${itemName(reward.item)}`);
    }
    for (const reward of (task.finishRewards?.traderStanding || []).slice(0, 2)) {
      rewardSummary.push(`${reward.standing > 0 ? "+" : ""}${reward.standing} ${traderName(reward.trader)} reputation`);
    }
    const requiredObjectives = objectives.filter((objective) => !objective.optional);
    return {
      id: task.id,
      name: translated(task.name, dictionary, task.normalizedName || "Unknown task"),
      traderId: task.trader || "",
      traderName: traderName(task.trader),
      minPlayerLevel: Number(task.minPlayerLevel || 0),
      primaryMapId: declaredMap || mapIdsForQuest[0] || null,
      mapIds: mapIdsForQuest,
      summary:
        requiredObjectives
          .slice(0, 2)
          .map((objective) => objective.description)
          .join(" · ") || "Review the quest objectives.",
      experience,
      chainDepth: 0,
      rewardSummary,
      objectives,
      requirements: (task.taskRequirements || []).map((requirement) => ({
        taskId: requirement.task,
        statuses: requirement.status || [],
      })),
    };
  });
  const byId = new Map(quests.map((quest) => [quest.id, quest]));
  const depths = new Map();
  const chainDepth = (quest, visiting = new Set()) => {
    if (depths.has(quest.id)) return depths.get(quest.id);
    if (visiting.has(quest.id)) return 0;
    visiting.add(quest.id);
    const depth = quest.requirements.reduce((maximum, requirement) => {
      const required = byId.get(requirement.taskId);
      return Math.max(maximum, required ? chainDepth(required, visiting) + 1 : 0);
    }, 0);
    visiting.delete(quest.id);
    depths.set(quest.id, depth);
    return depth;
  };
  for (const quest of quests) quest.chainDepth = chainDepth(quest);
  return { schemaVersion: 2, generatedAt: new Date().toISOString(), gameMode, quests };
}

function countCategories(pois) {
  return pois.reduce((counts, poi) => {
    counts[poi.category] = (counts[poi.category] || 0) + 1;
    return counts;
  }, {});
}

async function replaceAssets() {
  await rm(backupPublicMaps, { recursive: true, force: true });
  if (await exists(finalPublicMaps)) await rename(finalPublicMaps, backupPublicMaps);
  try {
    await rename(stagingPublicMaps, finalPublicMaps);
    await rm(backupPublicMaps, { recursive: true, force: true });
  } catch (error) {
    if (await exists(backupPublicMaps)) await rename(backupPublicMaps, finalPublicMaps);
    throw error;
  }
}

async function main() {
  await rm(stagingPublicMaps, { recursive: true, force: true });
  await mkdir(path.join(stagingPublicMaps, "svg"), { recursive: true });
  const [groups, rawPoiData, rawTranslations] = await Promise.all([
    fetchJson(mapsUrl),
    fetchJson(poiUrl),
    fetchJson(poiTranslationsUrl),
  ]);
  const apiData = rawPoiData.data;
  const dictionary = rawTranslations.data || {};
  const apiMaps = new Map(Object.values(apiData.maps || {}).map((map) => [map.normalizedName, map]));
  const mapIds = new Map(Object.values(apiData.maps || {}).map((map) => [map.id, map.normalizedName]));
  const interactive = groups.flatMap((group) =>
    group.maps.filter((map) => map.projection === "interactive").map((map) => ({ ...map, group })),
  );
  const checksums = {};
  const output = [];

  for (const map of interactive) {
    let baseAsset;
    let floors;
    const svgSource = map.svgPath
      ? { url: map.svgPath, filename: new URL(map.svgPath).pathname.split("/").pop(), baseLayer: map.svgLayer }
      : map.key === "the-lab"
        ? labSvg
        : null;

    if (svgSource) {
      const relative = `svg/${svgSource.filename}`;
      checksums[relative] = await writeResponse(svgSource.url, path.join(stagingPublicMaps, relative));
      baseAsset = { type: "svg", path: `/maps/${relative}`, baseLayer: svgSource.baseLayer || null };
      floors = (map.layers || []).map((layer, index) => {
        let svgLayer = layer.svgLayer || null;
        if (map.key === "the-lab") svgLayer = layer.name === "Second Level" ? "Second_Level" : "Technical_Level";
        return normalizeFloor({ ...layer, svgLayer }, index, null);
      });
    } else if (communityRasterMaps[map.key]) {
      const source = communityRasterMaps[map.key];
      const relative = `image/${source.filename}`;
      checksums[relative] = await writeResponse(source.url, path.join(stagingPublicMaps, relative));
      baseAsset = {
        type: "image",
        path: `/maps/${relative}`,
        bounds: map.bounds,
        calibrationStatus: "needs-local-verification",
      };
      floors = (map.layers || []).map((layer, index) => normalizeFloor(layer, index, baseAsset));
    } else {
      throw new Error(
        `Unsupported map asset format for ${map.key}; add an attributed SVG or calibrated community raster source`,
      );
    }

    const poiBundle = normalizePois(map.key, apiMaps.get(map.key), apiData, dictionary);
    const poiRelative = `poi/${map.key}.json`;
    checksums[poiRelative] = await writeJson(poiBundle, path.join(stagingPublicMaps, poiRelative));
    output.push({
      id: map.key,
      displayName: displayNames[map.key] || map.key,
      logAliases: aliases[map.key] || [map.key],
      bounds: map.bounds,
      svgBounds: map.svgBounds || null,
      transform: map.transform || [1, 0, 1, 0],
      coordinateRotation: map.coordinateRotation || 0,
      minZoom: map.minZoom,
      maxZoom: Math.max(map.maxZoom, 6),
      baseAsset,
      baseFloor: { id: baseAsset.baseLayer || "base", name: "Ground / Main" },
      floors,
      poiPath: `/maps/${poiRelative}`,
      poiCounts: countCategories(poiBundle.pois),
      attribution: communityRasterMaps[map.key]
        ? {
            name: communityRasterMaps[map.key].author,
            url: communityRasterMaps[map.key].authorLink,
          }
        : {
            name: map.author || "Tarkov.dev contributors",
            url: map.authorLink || "https://tarkov.dev",
          },
    });
  }

  await writeJson(checksums, path.join(stagingPublicMaps, "asset-checksums.json"));
  const [itemData, itemTranslations, traderData, traderTranslations] = await Promise.all([
    fetchJson(itemUrls[0]),
    fetchJson(itemUrls[1]),
    fetchJson(traderUrls[0]),
    fetchJson(traderUrls[1]),
  ]);
  for (const [gameMode, [dataUrl, translationUrl]] of Object.entries(questUrls)) {
    const [questData, questTranslations] = await Promise.all([fetchJson(dataUrl), fetchJson(translationUrl)]);
    const bundle = normalizeQuestBundle(
      gameMode,
      questData,
      questTranslations,
      mapIds,
      itemData,
      itemTranslations,
      traderData,
      traderTranslations,
    );
    const relative = `quests/${gameMode}.json`;
    checksums[relative] = await writeJson(bundle, path.join(stagingPublicMaps, relative));
  }
  await writeJson(
    {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      sources: [
        mapsUrl,
        poiUrl,
        poiTranslationsUrl,
        ...Object.values(questUrls).flat(),
        ...itemUrls,
        ...traderUrls,
        svgBase,
        ...Object.values(communityRasterMaps).map((source) => source.url),
        "https://reemr.se/",
      ],
      assetCount: Object.keys(checksums).length,
    },
    path.join(stagingPublicMaps, "data-manifest.json"),
  );
  await writeJson(checksums, path.join(stagingPublicMaps, "asset-checksums.json"));
  await writeJson(groups, path.join(stagingPublicMaps, "upstream-maps.json"));
  await writeResponse(licenseUrl, path.join(stagingPublicMaps, "LICENSE.md"));
  await replaceAssets();
  await writeFile(generatedPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    `Synced ${output.length} maps, ${output.reduce((sum, map) => sum + Object.values(map.poiCounts).reduce((a, b) => a + b, 0), 0)} POIs, and ${Object.keys(checksums).length} asset files.`,
  );
}

main().catch(async (error) => {
  await rm(stagingPublicMaps, { recursive: true, force: true }).catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
});
