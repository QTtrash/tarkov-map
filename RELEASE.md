# Release gates

## Private beta

- Run `npm ci`, `npm test`, `npm run build`, `cargo test`, and `cargo clippy -- -D warnings`.
- Regenerate assets deliberately and inspect `public/maps/data-manifest.json` plus checksums.
- Smoke-test screenshot parsing, OCR with the O panel, PvP/PvE quest state, overlay shortcuts, and phone pairing on a second device.
- Test install/uninstall on a clean Windows 10 or 11 account.

## Public download

- Obtain written redistribution permission for raster tiles or replace them with assets carrying explicit compatible terms.
- Obtain a Windows Authenticode certificate and sign the NSIS executable with timestamping.
- Generate and securely store a separate Tauri updater key; publish signed artifacts and HTTPS `latest.json` metadata.
- Publish the privacy notice, third-party notices, checksums, SBOM, support route, and the exact passive file-only safety boundary.
- Configure a production relay domain, provider budget alerts, aggregate abuse monitoring, and provider-log retention before enabling Internet rooms.
- Do not describe the application as officially approved or guaranteed safe by Battlestate Games or BattlEye.

Unsigned private builds remain acceptable for testing but will trigger Windows SmartScreen reputation warnings.
