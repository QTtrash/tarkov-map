# Raid Signal

Raid Signal is a free, noncommercial Windows raid navigator for Escape from Tarkov. It reads ordinary screenshot filenames and application logs written by the game, plots the latest coordinates on bundled offline maps, and can share live squad positions through an end-to-end encrypted LAN or Internet room.

It never reads game memory, injects input, modifies game files, or sends screenshots, logs, account information, quests, custom pins, or historical positions. Raid Signal is not affiliated with or endorsed by Battlestate Games.

## Desktop use

1. Start **Raid Signal** before entering a raid.
2. If automatic discovery does not find the game, select its `Screenshots` and `Logs` folders in Settings.
3. Take a native in-game screenshot. The latest coordinates and heading appear on the selected map.
4. To detect raid-specific exits, press **O**, leave the extraction panel visible, and take a screenshot.

All 13 current interactive maps, POIs, PvP/PvE quests, and map artwork are bundled for offline desktop use. The native overlay can be toggled with `Ctrl+Shift+M`; `Ctrl+Shift+X` restores mouse interaction.

## Encrypted squad sharing

Open **Phone / Squad Link** and choose:

- **Internet:** creates a three-hour invitation at `https://signal.mouchsiadis-solutions.com/room/<ROOM_ID>#<KEY>`. Other Raid Signal desktops can paste it and publish; the hosted phone companion is view-only.
- **Same Wi-Fi / LAN:** runs the existing companion directly from the desktop's private address.

Internet messages use AES-256-GCM with a fresh 96-bit nonce and room-bound authenticated data. The key is stored in the URL fragment, which is not sent to the relay. The relay forwards ciphertext only and keeps no message history. It can still observe IP addresses, connection timing, and room activity. Anyone with the invitation can join, and a modified client with the key could forge a position, so invitations must remain private.

Room limits are 8 connected clients, 3 hours, 4 KB per message, and 10 messages per second per connection.

## Development

Desktop development and packaging must be done on Windows:

```powershell
npm ci
npm test
npm run tauri:dev
```

Build the stable unsigned NSIS installer locally with `npm run tauri:build`. The result is under `src-tauri/target/release/bundle/nsis/`. See [RELEASE.md](RELEASE.md) for clean-machine verification and publishing.

The VPS-hosted companion and relay are packaged separately:

```bash
npm ci
npm test
npm --prefix relay ci
npm --prefix relay test
./ops/deploy
```

The Node relay and optional Cloudflare Durable Object adapter live in `relay/`. Both are deliberately unable to interpret encrypted position payloads.

## Map data and licensing

Run `npm run assets:sync` only when deliberately refreshing the bundled Tarkov.dev snapshot. Eleven map artworks come from `the-hideout/tarkov-dev-svg-maps`; Icebreaker and Labyrinth use pinned RE3MR images. These artworks are distributed under CC BY-NC-SA 4.0, so Raid Signal remains free and noncommercial. Sources, checksums, attribution, and adaptations are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md), `public/maps/data-manifest.json`, `public/maps/asset-checksums.json`, and `public/maps/LICENSE.md`.
