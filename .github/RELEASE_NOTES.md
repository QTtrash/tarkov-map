## What changed

- Active quests can now show all of their objectives on the selected map.
- Quest markers remain opt-in and have a dedicated Utility toggle.
- Hide all now hides focused and active quest markers together.
- Changing maps or PvP/PvE modes clears markers that no longer apply.

This is Raid Signal's first merged community feature. Thank you
[@TedCreator](https://github.com/TedCreator) for contributing the foundation in
[#12](https://github.com/QTtrash/tarkov-map/pull/12). Maintainer review added
compatibility hardening and regression coverage before merge.

Settings schema v2 and room protocol v1 remain compatible. This release does not
change filesystem access, relay behavior, telemetry, or sharing trust boundaries.

## Install and verify

Download installers only from this GitHub Release. The release assets include a
SHA-256 checksum, `release.json`, an SPDX SBOM, and GitHub build provenance.

- [Installation and verification](https://github.com/QTtrash/tarkov-map#install-and-verify)
- [Source code](https://github.com/QTtrash/tarkov-map)
- [Privacy policy](https://github.com/QTtrash/tarkov-map/blob/main/PRIVACY.md)
- [License and asset boundary](https://github.com/QTtrash/tarkov-map/blob/main/ASSET_LICENSES.md)

The Windows installer is currently unsigned and may show an unknown-publisher
warning. Raid Signal is independent and not endorsed by Battlestate Games.
