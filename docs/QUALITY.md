# Quality contract

`npm run check:all` is the required local verification gate. It performs formatting,
linting, frontend tests and desktop/web builds, relay tests/build, Rust tests and
Clippy, asset checksum validation, and Node dependency audits.

GitHub Actions and Dependabot update configuration have been removed. Maintainers
run verification locally and record the results in pull requests. Run Playwright
critical paths with `npm run test:e2e` after installing Chromium with
`npx playwright install chromium`. CodeQL, dependency review, secret scans, and
RustSec are no longer automatic gates. Review dependency updates manually.

Manual releases require a clean Tauri build, Microsoft Defender and ClamAV scans,
SHA-256, and an SPDX SBOM; see [Releasing](RELEASING.md). New releases do not
receive GitHub Actions build provenance.

## Test ownership

- Pure parsing, geometry, protocol, and domain rules: unit tests beside modules.
- Quest-log fixtures cover inline and multiline records, profile/mode attribution,
  cross-source scanning and deduplication, unrelated notification/lifecycle
  rejection, suspicious start bursts, and manual-versus-log ordering.
- Quest compatibility UI tests cover configured-root versus active-session
  display, visible scan outcomes, zero-event explanations, and privacy-safe
  clipboard summaries.
- Storage, filesystem, HTTP, WebSocket, and native boundaries: failure-oriented
  integration tests including malformed and missing input.
- User journeys and keyboard/focus behavior: `tests/e2e/` in Chromium.
- Packaged Windows behavior: manual clean build, installer scans, and smoke test.

## Temporary security exception

`RUSTSEC-2024-0429` / `GHSA-wrw7-89jp-8q8g` affects `glib 0.18.5`, which enters
the lockfile only through Tauri/Wry's Linux GTK dependency graph. Raid Signal
ships only a Windows installer, does not depend on `glib` directly, and does not
call the affected `VariantStrIter` API. The removed Rust advisory job allowed
only this advisory. When running a manual Rust advisory audit, retain that
narrow exception with `cargo audit --file src-tauri/Cargo.lock --ignore RUSTSEC-2024-0429`
(requires `cargo-audit`) and investigate every other reported vulnerability.

Remove the exception as soon as Tauri/Wry can resolve `glib >= 0.20.0`, or before
adding Linux as a supported release platform. Reassess it during every Tauri
dependency update.

A defect fix is incomplete without a regression test that fails for the original
case. Generated snapshots and build outputs are never reviewable source.
