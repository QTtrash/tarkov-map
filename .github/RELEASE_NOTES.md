## What changed

Raid Signal v1.4.1 makes extraction names readable at the map overview, adds
useful quest-marker details, and gives phone users control over their waypoints.

- Enabled extraction names appear immediately on desktop, compact overlay, and
  phone, preserving filters, floors, active styling, and map interaction.
- Quest markers open the correct quest and objective, including offline text,
  a location preview, and bundled artwork where available. Generic quest images
  and possible spawn locations are clearly labeled.
- Quest artwork comes from Tarkov.dev's task image metadata and image CDN;
  credits and source links appear with the image. See the
  [asset provenance and restrictions](https://github.com/QTtrash/tarkov-map/blob/v1.4.1/ASSET_LICENSES.md).
- Phone users can delete one waypoint or clear waypoints on the current map;
  other maps' waypoints remain intact after reloading.
- Related fixes preserve cross-map quest focus, render waypoint tooltips safely,
  contain keyboard interactions, and serve WebP images correctly.
- Sharp is updated to 0.35.4 to resolve its reported dependency vulnerability.

## Compatibility, privacy, and limits

Settings schema v2 and room protocol v1 remain compatible. Quest profiles and
progress remain local and are not synchronized to the phone. Bundled quest
images work offline without external image requests. Invitation keys remain in
URL fragments, the relay forwards ciphertext only, and no position history is
stored.

Quest-log import remains experimental because current Tarkov builds may not
retain a safely attributable supported event format. Manual quest selection is
still the reliable fallback. Never publish raw Tarkov logs.

Raid Signal does not read game memory, inject input, automate play, modify game
files, or claim anti-cheat approval. It is independent and not endorsed by
Battlestate Games.

## Install and verify

Download installers only from this immutable GitHub Release. Assets include a
SHA-256 checksum, `release.json`, an SPDX SBOM, Microsoft Defender and ClamAV
scan gates, and GitHub build provenance.

- [Installation and verification](https://github.com/QTtrash/tarkov-map#install-and-verify)
- [Source code](https://github.com/QTtrash/tarkov-map)
- [Privacy policy](https://github.com/QTtrash/tarkov-map/blob/main/PRIVACY.md)
- [License and asset boundary](https://github.com/QTtrash/tarkov-map/blob/main/ASSET_LICENSES.md)

The Windows installer is currently unsigned and may show an unknown-publisher
warning.
