# Changelog

All notable changes to Raid Signal are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/QTtrash/tarkov-map/compare/v1.3.0...HEAD
[1.3.0]: https://github.com/QTtrash/tarkov-map/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/QTtrash/tarkov-map/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/QTtrash/tarkov-map/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/QTtrash/tarkov-map/releases/tag/v1.0.0
