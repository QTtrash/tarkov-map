## What changed

Raid Signal v1.4.0 brings the desktop’s live tactical context into the compact
native overlay and adds real candidate locations for find-item quest objectives.

- Live squad members now appear on the native overlay without opening a second
  relay connection or moving decrypted positions outside the desktop process.
- Active quest markers, including hollow candidate-location markers, now appear
  in the overlay when quest markers are enabled.
- Find-item objectives can show every known candidate spawn from the refreshed
  Regular, PvE, and Seasonal PvP intelligence snapshot.
- Floors that intentionally have no packaged SVG layer keep the base artwork
  visible.
- The last recognized extract panel remains available when a later screenshot
  contains unrelated text and clears when the raid ends.

Thank you [@Reiss-Cashmore](https://github.com/Reiss-Cashmore) for contributing
the five-PR feature and fix series behind the overlay, quest-location, map-layer,
and extract improvements.

## Compatibility, privacy, and limits

Settings schema v2 and room protocol v1 remain compatible. The overlay receives
only bounded, validated process-local snapshots from the main desktop webview.
Invitation keys remain in URL fragments, the relay still forwards ciphertext
only, and no position history is stored.

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
