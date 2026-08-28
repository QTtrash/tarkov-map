# Changelog

All notable changes to Raid Signal are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.4.0] - 2026-08-28

### Added

- Show live squad positions and active quest markers in the compact native
  overlay, contributed by
  [@Reiss-Cashmore](https://github.com/Reiss-Cashmore).
- Map candidate spawn locations for active find-item quest objectives, with
  distinct hollow markers and refreshed Regular, PvE, and Seasonal PvP data.

### Fixed

- Keep the base map visible when an elevation band intentionally has no
  packaged SVG layer.
- Preserve the last recognized extract panel when later screenshots contain
  unrelated OCR text, while clearing it when the raid ends.

### Changed

- Refresh the checksummed Tarkov.dev POI and quest snapshot, including current
  boss spawn chances and deduplicated candidate quest locations.
- Update compatible frontend tooling, paired CodeQL actions, and secret-scan
  tooling while retaining the pinned Node 22 and TypeScript 6 support lines.

### Security and privacy

- Validate and bound both local main-window-to-overlay event channels before
  sending or rendering their payloads. Decrypted squad positions remain
  process-local; settings schema v2, room protocol v1, invitation handling, and
  ciphertext-only relay behavior are unchanged.

## [1.3.1] - 2026-08-22

### Fixed

- Scan notification and output logs independently so an unrelated notification
  file no longer suppresses supported quest records in the corresponding output
  log, while deduplicating events found in both sources.
- Distinguish the configured parent logs root from the resolved active session
  and make folder rescans, quest scans, empty results, and successful imports
  visibly observable.

### Changed

- Mark quest-log import as experimental and report unsupported current log
  formats explicitly instead of presenting a zero-event scan without context.
- Add a privacy-safe Copy Diagnostics summary and structured compatibility issue
  form to help map future Tarkov formats without requesting raw logs.
- Treat quest lifecycle traces as diagnostic hints only; ambiguous IDs are never
  imported as task progress.

### Security and privacy

- Diagnostics exclude filesystem paths, profile and task IDs, timestamps,
  fingerprints, and raw log content. Settings schema v2, room protocol v1, and
  relay behavior remain unchanged.

## [1.3.0] - 2026-08-21

### Added

- Added opt-in quest-progress import from Tarkov-created notification logs after
  a local profile/mode preview, requested by Reddit community member
  [u/iShadowLTu](https://www.reddit.com/user/iShadowLTu/).
- Added isolated Regular PvP, PvE, and Seasonal PvP quest profiles, optional
  per-profile player levels, current-profile following, manual browsing, and a
  pause control for automatic syncing.
- Added a full Seasonal PvP quest-intelligence bundle and explicit unknown
  eligibility labels where the logs do not provide enough evidence.

### Changed

- Resolve imported and manual quest status by the newest explicit event, migrate
  existing v1.2 manual progress to detected current profiles, and enable quest
  markers only on the first confirmed import.
- Bound and validate log scanning, hash profile IDs before persistence, deduplicate
  rotated events, skip malformed/unattributed records, and quarantine suspicious
  quest-start bursts.
- Refreshed the checksummed Tarkov.dev quest/POI snapshot and RE3MR map assets with
  current provenance.

### Security and privacy

- Kept settings schema v2 and room protocol v1 compatible. Quest profiles,
  levels, progress, and log contents remain local and are never sent through a
  relay or to the phone companion.

## [1.2.0] - 2026-08-21

### Added

- Added ten opt-in loot-container groups with counts, distinct markers, and the
  same filtering across desktop, overlay, and phone companion, contributed by
  [@Carbneth](https://github.com/Carbneth) in
  [#15](https://github.com/QTtrash/tarkov-map/pull/15).

### Changed

- Preserved settings schema v2 compatibility while defaulting older settings to
  every loot group and allow-listing persisted group values in TypeScript and
  Rust.
- Upgraded the frontend to Vite 8, Vitest 4, and TypeScript 6 on Node 22.23 LTS,
  and migrated the relay compiler to TypeScript 7.
- Upgraded the Rust integration dependencies and migrated blocking Windows OCR
  calls to the current WinRT API.
- Updated pinned GitHub Actions and dependency/security tooling.

## [1.1.0] - 2026-08-20

### Added

- Added opt-in, map-specific markers for every objective belonging to an active
  quest, contributed by [@TedCreator](https://github.com/TedCreator) in
  [#12](https://github.com/QTtrash/tarkov-map/pull/12).

### Changed

- Prepared the repository for public contribution with explicit licensing,
  hardened verification, agent-readable architecture, and reproducible release
  automation.
- Made quest-marker visibility consistent across the desktop and companion,
  including Utility and Hide all controls and stale-marker cleanup when maps or
  PvP/PvE modes change.

## [1.0.0] - 2026-08-14

### Added

- Passive screenshot and log-based position location for the Windows desktop.
- Interactive maps, quest intelligence, overlay mode, custom pins, and floor
  selection.
- End-to-end encrypted Internet and LAN squad sharing with a phone companion.

[Unreleased]: https://github.com/QTtrash/tarkov-map/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/QTtrash/tarkov-map/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/QTtrash/tarkov-map/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/QTtrash/tarkov-map/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/QTtrash/tarkov-map/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/QTtrash/tarkov-map/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/QTtrash/tarkov-map/releases/tag/v1.0.0
