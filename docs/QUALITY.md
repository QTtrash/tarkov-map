# Quality contract

`npm run check:all` is the required local and CI gate. It performs formatting,
linting, frontend tests and desktop/web builds, relay tests/build, Rust tests and
Clippy, asset checksum validation, and Node dependency audits.

Additional CI gates run Playwright critical paths, CodeQL, dependency review,
RustSec, Gitleaks, and TruffleHog. Release CI adds a clean Tauri build, Microsoft
Defender and ClamAV scans, SHA-256, an SPDX SBOM, and artifact provenance.

## Test ownership

- Pure parsing, geometry, protocol, and domain rules: unit tests beside modules.
- Storage, filesystem, HTTP, WebSocket, and native boundaries: failure-oriented
  integration tests including malformed and missing input.
- User journeys and keyboard/focus behavior: `tests/e2e/` in Chromium.
- Packaged Windows behavior: release-workflow smoke build and installer scan.

A defect fix is incomplete without a regression test that fails for the original
case. Generated snapshots and build outputs are never reviewable source.
