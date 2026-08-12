# Tarkov Map Locator

A local-first Windows raid companion that reads the coordinates embedded in Escape from Tarkov screenshot filenames and displays the latest position on an offline map. Version 0.3 adds raid-extract OCR, richer map intelligence, quests, a compact overlay, custom waypoints, and encrypted LAN phone sharing.

## Use

1. Start **Tarkov Map Locator** before entering a raid.
2. If automatic discovery does not find Tarkov, use **Browse** to select the game's `Screenshots` and `Logs` folders.
3. Take a screenshot with Tarkov's native screenshot key. The newest coordinates and heading appear on the selected map.
4. To detect raid-specific exits, press **O** so the extraction panel is visible, then take the screenshot. Confirmed exits are highlighted; otherwise the app continues to label exits as static possibilities.

The current raid map is detected from the application log when available. Map and floor can always be selected manually. All 13 current interactive maps, artwork, and map intelligence are bundled for offline use. Screenshot deletion is optional and disabled by default.

Open the **Intel** rail to search and toggle extracts, transits, switches, hazards, named boss zones, locked access, BTR stops, spawns, loot containers, and weapons. Double-click the map to place a persistent custom waypoint.

The **Quest Navigator** stores separate PvP and PvE progress locally and can focus positioned objectives on the map. The **Overlay** button or `Ctrl+Shift+M` opens a separate always-on-top map; `Ctrl+Shift+X` restores mouse interaction if click-through was enabled. **Phone / Squad Link** creates an encrypted QR invitation for devices on the same LAN.

Use **Read latest screenshot** in Settings after launching late or recovering from a folder/watch problem. `Ctrl+K` opens and focuses map intelligence search.

## Development

```powershell
npm install
npm run assets:sync
npm run tauri:dev
```

Build the unsigned Windows installer with:

```powershell
npm run tauri:build
```

The installer is written under `src-tauri/target/release/bundle/nsis/`.

Public releases require an Authenticode certificate, Tauri updater key, HTTPS release metadata, and resolution of the raster-map redistribution gate documented in `RELEASE.md`. The LAN companion is usable without any hosted service. The optional Internet relay source is under `relay/` and is not enabled in the app until a production endpoint is configured.

The application never reads game memory, injects input, or modifies game files. It watches ordinary screenshot filenames and log files written by the game. This project is not affiliated with or endorsed by Battlestate Games.

## Offline map data

Run `npm run assets:sync` only when deliberately refreshing the bundled snapshot from Tarkov.dev. This regenerates checksums, source metadata, map intelligence, and the PvP/PvE quest bundles. The installed application performs no network requests for maps, POIs, OCR, or quests. See `THIRD_PARTY_NOTICES.md`, `public/maps/data-manifest.json`, and `public/maps/LICENSE.md` for attribution and provenance.
