# Quality contract

`npm run check:all` is the required local and CI gate. It performs formatting,
linting, frontend tests and desktop/web builds, relay tests/build, Rust tests and
Clippy, asset checksum validation, and Node dependency audits.

Additional CI gates run Playwright critical paths, CodeQL, dependency review,
RustSec, Gitleaks, and TruffleHog. Release CI adds a clean Tauri build, Microsoft
Defender and ClamAV scans, SHA-256, an SPDX SBOM, and artifact provenance.

## Test ownership

- Pure parsing, geometry, protocol, and domain rules: unit tests beside modules.
- Quest-log fixtures cover multiline records, profile/mode attribution,
  deduplication, suspicious start bursts, and manual-versus-log ordering.
- Storage, filesystem, HTTP, WebSocket, and native boundaries: failure-oriented
  integration tests including malformed and missing input.
- User journeys and keyboard/focus behavior: `tests/e2e/` in Chromium.
- Packaged Windows behavior: release-workflow smoke build and installer scan.

## Temporary security exception

`RUSTSEC-2024-0429` / `GHSA-wrw7-89jp-8q8g` affects `glib 0.18.5`, which enters
the lockfile only through Tauri/Wry's Linux GTK dependency graph. Raid Signal
ships only a Windows installer, does not depend on `glib` directly, and does not
call the affected `VariantStrIter` API. Dependabot cannot currently resolve a
patched `glib` version through the latest compatible Tauri/Wry release, so the
Rust advisory job ignores only this advisory while continuing to block every
other vulnerability.

Remove the exception as soon as Tauri/Wry can resolve `glib >= 0.20.0`, or before
adding Linux as a supported release platform. Reassess it during every Tauri
dependency update.

A defect fix is incomplete without a regression test that fails for the original
case. Generated snapshots and build outputs are never reviewable source.
