## What changed

Raid Signal can now recognize explicit quest started, failed, and completed
events from the same Tarkov-created logs it already locates for raid context.
The first import is opt-in: the desktop shows an anonymized profile/mode preview
before writing anything, then keeps the newest session synchronized while the
app is running.

- Active tasks can automatically populate their objective markers on the map.
- Regular PvP, PvE, and Seasonal PvP progress is isolated by hashed profile.
- Existing v1.2 manual progress is attached to detected current profiles during
  the first confirmed backfill.
- A later manual correction or log event wins by timestamp; automatic syncing
  can be paused at any time.
- Player level is optional and only informs clearly labeled “possibly
  locked/available” suggestions. Seasonal eligibility remains unknown unless an
  explicit event exists.
- The bundled Tarkov.dev intelligence snapshot now includes 517 Regular PvP,
  514 PvE, and 491 Seasonal tasks.

Thank you Reddit community member
[u/iShadowLTu](https://www.reddit.com/user/iShadowLTu/) for proposing automatic
task detection and active-objective display. Thank you also
[@TedCreator](https://github.com/TedCreator) for the v1.1 active-marker
foundation and [@Carbneth](https://github.com/Carbneth) for the v1.2 loot-filter
contribution that helped establish the community release loop.

## Compatibility, privacy, and limits

Settings schema v2 and room protocol v1 remain compatible. The phone companion
continues to use manual quest state. Profile IDs are hashed before local SQLite
persistence; logs, profile data, player level, and quest progress never enter
Internet or LAN sharing. The relays still forward ciphertext only and store no
position history.

The importer trusts only explicit supported log events. It does not read game
memory, infer completion from prerequisite graphs, inject input, automate play,
or modify game files. No anti-cheat approval or guarantee is implied.

## Install and verify

Download installers only from this GitHub Release. The release assets include a
SHA-256 checksum, `release.json`, an SPDX SBOM, and GitHub build provenance.

- [Installation and verification](https://github.com/QTtrash/tarkov-map#install-and-verify)
- [Source code](https://github.com/QTtrash/tarkov-map)
- [Privacy policy](https://github.com/QTtrash/tarkov-map/blob/main/PRIVACY.md)
- [License and asset boundary](https://github.com/QTtrash/tarkov-map/blob/main/ASSET_LICENSES.md)

The Windows installer is currently unsigned and may show an unknown-publisher
warning. Raid Signal is independent and not endorsed by Battlestate Games.
