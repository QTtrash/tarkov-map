## What changed

Raid Signal v1.3.1 makes the experimental quest-log importer honest and
observable on current Tarkov builds. Real retained logs showed that some builds
do not write the explicit quest-event records supported by v1.3.0. The app now
explains that result instead of leaving a zero-event scan unexplained.

- Notification and output logs are scanned independently, with duplicate
  supported events collapsed.
- Settings shows the configured parent logs root separately from the active
  `log_*` session.
- Folder rescans, quest scans, empty results, disabled imports, and successful
  marker updates now have visible status feedback.
- Ambiguous lifecycle traces are counted only as compatibility hints. Raid
  Signal never treats nearby condition, asset, or request IDs as task IDs.
- Copy Diagnostics produces a counts-only summary for the new structured
  compatibility report; it excludes paths, IDs, timestamps, fingerprints, and
  raw log content.

Quest-log import remains experimental. If your current build reports no
recognized quest events, manual quest selection remains the reliable path while
the community helps document a safely attributable replacement format. Please
use [the compatibility form](https://github.com/QTtrash/tarkov-map/issues/new?template=quest_log_compatibility.yml)
and never publish raw Tarkov logs.

Thank you Reddit community member
[u/iShadowLTu](https://www.reddit.com/user/iShadowLTu/) for proposing automatic
task detection and active-objective display, and everyone testing the early
implementation. Thank you also [@TedCreator](https://github.com/TedCreator) for
the active-marker foundation and [@Carbneth](https://github.com/Carbneth) for
the loot-filter contribution.

## Compatibility, privacy, and limits

Settings schema v2 and room protocol v1 remain compatible. Quest data and logs
stay local; the phone companion continues to use manual quest state. The relay
still forwards ciphertext only and stores no position history.

The importer trusts only explicit supported log events. It does not read game
memory, infer task state from prerequisite graphs or ambiguous traces, inject
input, automate play, or modify game files. No anti-cheat approval or guarantee
is implied.

## Install and verify

Download installers only from this GitHub Release. Assets include a SHA-256
checksum, `release.json`, an SPDX SBOM, and GitHub build provenance.

- [Installation and verification](https://github.com/QTtrash/tarkov-map#install-and-verify)
- [Source code](https://github.com/QTtrash/tarkov-map)
- [Privacy policy](https://github.com/QTtrash/tarkov-map/blob/main/PRIVACY.md)
- [License and asset boundary](https://github.com/QTtrash/tarkov-map/blob/main/ASSET_LICENSES.md)

The Windows installer is currently unsigned and may show an unknown-publisher
warning. Raid Signal is independent and not endorsed by Battlestate Games.
