# Architecture

## Deployable surfaces

| Surface             | Runtime                            | Responsibility                                                                                                                                                                    |
| ------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop and overlay | React in Tauri 2, Rust native core | Observe Tarkov-created screenshots/logs, derive local position and raid context, render maps, persist local settings and quest state, and optionally publish encrypted positions. |
| Phone companion     | Static React/Vite page             | Parse an invitation fragment locally, decrypt live positions, and render the same map intelligence without publishing from the hosted phone UI.                                   |
| Internet relay      | Node 22 with `ws`                  | Serve static web assets, enforce connection/message limits, and fan out opaque WebSocket frames.                                                                                  |
| LAN share           | Axum inside the desktop            | Serve the packaged companion and fan out bounded encrypted frames on the local network.                                                                                           |

Installers are GitHub Release assets. The VPS never stores or serves executable
files. The Cloudflare Worker adapter is not a supported runtime.

## Data flow

1. Rust watches user-selected screenshot and log directories.
2. Parsers emit validated Tauri events; React keeps the current locator snapshot.
   After explicit review and confirmation, supported quest notifications are
   deduplicated into profile-isolated local SQLite state. Raw profile IDs are
   hashed before persistence.
3. Bundled map/quest/POI JSON and native quest-sync payloads are validated before
   rendering.
4. Sharing clients create a timestamped room ID and 256-bit key. AES-256-GCM
   uses a fresh 96-bit nonce and room-bound authenticated data for every update.
5. The key remains after `#` in the invitation URL. Browsers do not send that
   fragment to the HTTP or WebSocket server.
6. Relays enforce limits and forward ciphertext without parsing application data.

## Ownership boundaries

- `src/sharing/` owns protocol v1, invitation parsing, encryption, and decrypted
  payload validation.
- `src/validation.ts` owns untrusted TypeScript runtime schemas.
- `src/components/map-view-helpers.ts` owns Leaflet rendering primitives;
  `MapView.tsx` owns their lifecycle and synchronization.
- `SettingsDialog.tsx` and `AboutDialog.tsx` own modal presentation; `App.tsx`
  owns application state and orchestration.
- `src-tauri/src/model.rs` owns native settings and command payload models.
- `src-tauri/src/overlay.rs` and `quest_progress.rs` own their native command
  families and local quest-event persistence; `quest_log.rs` owns bounded,
  failure-tolerant quest notification parsing. `lib.rs` wires commands, plugins,
  and lifecycle together.
- `src-tauri/src/watcher.rs` owns filesystem observation and locator orchestration;
  parsing belongs in the dedicated parser/log/OCR modules.
- `relay/src/server.ts` owns the public HTTP/WebSocket process and must remain
  ignorant of plaintext position schemas.
- `public/maps/` is a versioned third-party data snapshot, not application source.

Dependencies must point inward toward domain types and pure logic. UI components
may call adapters; domain/protocol modules must not import React, Leaflet, Tauri,
filesystem, or server code.
