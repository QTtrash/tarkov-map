## What changed

- Loot containers can now be filtered through ten useful groups, including
  drawers, bags, weapon and ammo containers, medical, technical, supply crates,
  safes and cash, hidden caches, bodies, and a safe fallback for future types.
- Each group has its own count, icon, and map color in the desktop, overlay, and
  encrypted phone companion.
- Selecting a child group while the parent layer is off enables only that group,
  making it quick to reduce a dense map to the containers relevant to a raid.
- The web, relay, Rust, and GitHub Actions dependency stacks were upgraded and
  repaired against the project's full Windows and browser verification gates.

Thank you [@Carbneth](https://github.com/Carbneth) for contributing the feature
and UI foundation in [#15](https://github.com/QTtrash/tarkov-map/pull/15).
Maintainer review completed inherited-key, settings-migration, focus-state, and
browser edge-case hardening before merge.

Settings schema v2 and room protocol v1 remain compatible. Older settings gain
all loot groups by default. This release does not change filesystem access,
invitation-fragment handling, relay plaintext visibility, telemetry, or position
history: the relay still forwards ciphertext only and stores no positions.

## Install and verify

Download installers only from this GitHub Release. The release assets include a
SHA-256 checksum, `release.json`, an SPDX SBOM, and GitHub build provenance.

- [Installation and verification](https://github.com/QTtrash/tarkov-map#install-and-verify)
- [Source code](https://github.com/QTtrash/tarkov-map)
- [Privacy policy](https://github.com/QTtrash/tarkov-map/blob/main/PRIVACY.md)
- [License and asset boundary](https://github.com/QTtrash/tarkov-map/blob/main/ASSET_LICENSES.md)

The Windows installer is currently unsigned and may show an unknown-publisher
warning. Raid Signal is independent and not endorsed by Battlestate Games.
