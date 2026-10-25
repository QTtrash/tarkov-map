# Releasing

GitHub Actions no longer builds or publishes installers. The maintainer builds
manually on Windows from a clean checkout of a protected `vMAJOR.MINOR.PATCH` tag.
The tag version must match `package.json` and `src-tauri/Cargo.toml`. Follow the
toolchain setup in `CONTRIBUTING.md` and keep release outputs outside the checkout.

## Build and verify

1. Finalize `CHANGELOG.md`, review the changes and local verification results,
   and merge them. Create and push the protected tag on the intended `main` commit.
2. Check out that tag in a fresh Windows checkout. Confirm `git status --short`
   is empty and the tag and manifest versions match. Record the tag and commit SHA.
3. Install dependencies and run the complete local gate, browser tests, and
   installer build from that checkout:

   ```powershell
   npm ci
   npm --prefix relay ci
   npm run check:all
   npx playwright install chromium
   npm run test:e2e
   npm run tauri:build
   ```

   Stop if any command fails. Record toolchain versions and verification results.

4. Stage the single NSIS installer outside the repository, using PowerShell:

   ```powershell
   $version = (Get-Content package.json -Raw | ConvertFrom-Json).version
   $tag = "v$version"
   $filename = "Raid-Signal-Setup-$version.exe"
   $releaseDir = Join-Path $env:TEMP ("raid-signal-release-" + [guid]::NewGuid())
   New-Item -ItemType Directory -Path $releaseDir | Out-Null
   $candidates = @(Get-ChildItem src-tauri/target/release/bundle/nsis -Filter '*setup.exe')
   if ($candidates.Count -ne 1) { throw "Expected exactly one NSIS installer" }
   $installer = Join-Path $releaseDir $filename
   Copy-Item -LiteralPath $candidates[0].FullName -Destination $installer
   ```

## Scan and prepare assets

1. Update Microsoft Defender signatures and run a custom scan of the staged
   installer. Review the scan result and Protection history; any detection,
   quarantine, or scan failure blocks publication. Keep Defender enabled.
2. Independently scan the same bytes using ClamAV with current signatures, on a
   separate machine or environment if necessary. Require a successful scan with
   no detections and record both scanners' versions, signature dates, and results.
   Compare SHA-256 hashes if the installer is transferred between machines.
3. Generate the checksum and `release.json` from the final scanned installer.
   Continue in the same PowerShell session:

   ```powershell
   $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $installer).Hash.ToLowerInvariant()
   "$hash  $filename" | Set-Content -Encoding utf8 (Join-Path $releaseDir "$filename.sha256")
   @{
     version = $version
     filename = $filename
     downloadUrl = "https://github.com/QTtrash/tarkov-map/releases/download/$tag/$filename"
     sha256 = $hash
     size = (Get-Item -LiteralPath $installer).Length
     publishedAt = (Get-Date).ToUniversalTime().ToString('o')
   } | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $releaseDir 'release.json')
   ```

   Preserve these manifest fields and installer naming: the companion deployment
   consumes them through `npm run release:manifest`.

4. Generate an SPDX JSON SBOM from the tagged checkout using Syft, writing it to
   `$releaseDir/raid-signal-$tag.spdx.json`. Record the Syft version and confirm
   the SBOM includes the root npm, relay npm, and Rust lockfile dependencies.
5. Prepare release notes for the new version using `.github/RELEASE_NOTES.md` as
   a starting point. Replace its historical version details and Actions scan-gate
   and provenance claims with the actual manual build and scan evidence. Include
   the tag, commit SHA, toolchain versions, test results, and scanner results.
   Do not claim GitHub Actions build provenance for a manual build.

## Publish and smoke-test

1. Create a draft GitHub Release for the existing protected tag. Upload the
   installer, `.sha256`, `release.json`, and SPDX SBOM, and attach the prepared
   release notes. Review the draft and publish it with immutable releases enabled.
   No GitHub Actions environment approval gates this manual publication.
2. Download the published installer and verify its checksum against both the
   checksum file and manifest. Install and launch it in a clean Windows environment
   and run the applicable manual Windows test checklist. Attestation verification
   in historical checklists applies only to releases that have an attestation.

Never replace assets in an existing release. If an artifact is wrong, publish a
new patch version. Historical releases retain their original attestations and
scan evidence; removing the workflows does not invalidate those records.

The current installer is unsigned. Before integrating SignPath Foundation or
making code-signing claims, complete the eligibility gate in
[`SIGNPATH_PREFLIGHT.md`](SIGNPATH_PREFLIGHT.md). A signed installer must be
published as a new version; immutable release assets are never replaced.
