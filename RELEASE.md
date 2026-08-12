# Raid Signal 1.0 release procedure

Raid Signal 1.0 is a stable direct download. The first release is intentionally unsigned; stable status does not imply Authenticode signing. The download page must clearly state that Windows can display an unknown-publisher or SmartScreen warning.

## Local Windows verification

Run on a clean Windows development machine:

```powershell
npm ci
npm test
npm run build
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
npm run tauri:build
```

Then:

1. Scan the application executable and final NSIS installer with Microsoft Defender.
2. Install and uninstall under standard-user accounts in clean Windows 10 and Windows 11 VMs.
3. Confirm the fresh `com.mouchsiadis.raidsignal` identity, settings, screenshot/log discovery, OCR, overlay recovery, quests, and custom pins.
4. Test a LAN phone invitation and an Internet invitation between separate networks, including a second publishing desktop.
5. Confirm wrong, tampered, leaked, and expired invitation behavior; stale markers must dim at 60 seconds and disappear at 120 seconds.
6. On Icebreaker and Labyrinth, compare multiple known screenshot fixes and POIs across opposite map edges. Adjust the derived crop/bounds until markers land correctly; do not publish while either `calibrationStatus` remains `needs-local-verification`.
7. After local coordinate verification, change both derived asset declarations to `calibrationStatus: "verified"`, regenerate/check their hashes, commit, and rerun the full suite.
8. Generate and independently compare the installer SHA-256.

Do not perform the Tauri, Cargo, NSIS, or executable checks on the VPS.

## Direct publication

From a local shell with SSH access to the VPS:

```bash
./ops/publish-release ./src-tauri/target/release/bundle/nsis/Raid-Signal_1.0.0_x64-setup.exe 1.0.0 truegrind@YOUR_VPS
```

The publisher uploads to a staging name, verifies size and SHA-256 remotely, then atomically publishes `Raid-Signal-Setup-1.0.0.exe` and `release.json`. The landing page enables its download only when the manifest and artifact agree.

## Future code signing

When a validated publisher identity is available, sign the application executable and NSIS installer, timestamp them with an RFC 3161 SHA-256 timestamp, and verify with `signtool verify /pa /all /v`. The release manifest and hosted download path do not need to change.

## Public assertions

- Do not call Raid Signal officially approved, anti-cheat safe, or endorsed by Battlestate Games/BattlEye.
- Do not claim the relay hides IP addresses or room activity.
- Do not claim view-only phones are a cryptographic publishing restriction.
- Keep map attribution and the free noncommercial boundary visible.
