# Raid Signal v1.4.0 manual Windows test

Use this checklist on Windows 10 or 11 after the automated release workflow has
passed. Test locator and extract behavior in a practice/offline raid. Never
publish screenshots, raw Tarkov logs, or invitation URLs.

## Install and verify

1. Close Raid Signal if an older version is running. Leave the older version
   installed so the upgrade also tests settings-schema compatibility.
2. Download `Raid-Signal-Setup-1.4.0.exe` and
   `Raid-Signal-Setup-1.4.0.exe.sha256` from the immutable
   [v1.4.0 release](https://github.com/QTtrash/tarkov-map/releases/tag/v1.4.0).
3. Open PowerShell in the download directory and verify the installer:

   ```powershell
   $expected = (Get-Content .\Raid-Signal-Setup-1.4.0.exe.sha256).Split()[0]
   $actual = (Get-FileHash .\Raid-Signal-Setup-1.4.0.exe -Algorithm SHA256).Hash.ToLowerInvariant()
   if ($actual -ne $expected) { throw "Raid Signal checksum mismatch" }
   $actual
   ```

   The expected SHA-256 is:

   ```text
   00e3be5385880bfdcaffaf11ec389b02919011019389c1560d19583a10123ebb
   ```

4. If GitHub CLI is installed, verify the build provenance:

   ```powershell
   gh attestation verify .\Raid-Signal-Setup-1.4.0.exe -R QTtrash/tarkov-map
   ```

5. Run the installer. It is currently unsigned, so Windows may display an
   unknown-publisher warning. Only after the checksum succeeds, use
   **More info → Run anyway** if required. Do not disable Microsoft Defender.
6. In **Windows Settings → Apps → Installed apps**, confirm that Raid Signal is
   version `1.4.0`.
7. Launch Raid Signal. An upgrade passes when the app opens and the previous
   settings remain intact.

## One-PC smoke tests

### Map and overlay

1. Switch between several maps using the map selector and confirm their artwork
   loads.
2. Select **Reserve**, then select the **2nd floor** elevation. The base map must
   remain visible instead of becoming blank.
3. Click **Overlay** or press `Ctrl+Shift+M`. Confirm that the compact,
   always-on-top map appears.
4. Change **Settings → Overlay opacity** and confirm the window responds.
5. If click-through is enabled, press `Ctrl+Shift+X` to restore interaction.
6. If the overlay is off-screen, use **Settings → Reset & Show Overlay**.

### Candidate quest locations

1. Open **Quest Navigator**, select **Regular**, and search for
   `Saving the Mole`.
2. Change the quest status to **ACTIVE**.
3. Expand the quest and use **SHOW AREA · GROUND ZERO** for the scientist's
   hard-drive objective.
4. Open **Map Intelligence** and ensure **Quest markers** is enabled.
5. Confirm that four hollow hard-drive candidate markers appear. Solid markers
   for the quest's other objectives may also be present.
6. Open the compact overlay with `Ctrl+Shift+M` and confirm that it shows the
   same quest markers.
7. Change the quest status to **COMPLETED** and confirm that its active markers
   disappear.

### Screenshot locator and extracts

1. Open settings and confirm the screenshot directory is detected. Its usual
   location is `Documents\Escape from Tarkov\Screenshots`.
2. If it is not detected, use **Settings → Screenshots → Browse**, select the
   folder, and click **Rescan Folders**.
3. Confirm **Locator Online** and **Screenshot Watcher Ready** are shown. Keep
   **Delete parsed screenshots** disabled during the test.
4. Enter a practice/offline raid. If log-based map detection is unavailable,
   select the current map manually.
5. Take a normal Tarkov screenshot. Confirm that Raid Signal updates the player
   coordinates and map position.
6. Press `O`, leave the extraction panel visible, and take another screenshot.
   Confirm that Raid Signal reports recognized active extracts.
7. Close the extraction panel and take a screenshot containing normal HUD text.
   The previously recognized extracts must remain visible.
8. End the raid. If log-based raid detection is available, confirm that raid and
   extract state clears.

## Sharing tests

A phone is sufficient to test the companion view. A second Windows PC running
Raid Signal is required to test another live squad marker in the overlay.

### Phone companion

1. Acquire a desktop position from a screenshot.
2. Open **Phone / Squad Link**, select **Internet**, enter a callsign, and click
   **Create Internet Room**.
3. Scan the QR code with a phone. Confirm that the companion opens and displays
   the desktop position.
4. Confirm that the invitation contains a URL fragment beginning with `#`.
   Treat the complete invitation as a secret.
5. Click **End Session** and confirm that the phone disconnects.

### Two Windows desktops

1. Create an Internet room on the first PC and privately copy the invitation to
   the second PC.
2. On the second PC, open **Phone / Squad Link**, paste the invitation, and use
   **Join and Publish**.
3. Acquire a screenshot position on both PCs.
4. On the first PC, confirm that the second callsign and marker appear on the
   desktop map and compact overlay.
5. Stop publishing from the second PC. Its marker should become stale after
   about 60 seconds and disappear after about 120 seconds.
6. End the room and confirm that squad markers clear immediately.

## Pass criteria

- The installer checksum and optional provenance verification pass.
- The upgrade retains settings and Windows reports version 1.4.0.
- Reserve's 2nd-floor selection retains its base artwork.
- Saving the Mole shows four hollow candidate markers on the desktop and
  overlay, then removes them when completed.
- A Tarkov screenshot updates the local map position.
- Recognized extracts survive a later unrelated screenshot.
- Any companion or second-desktop session ends cleanly without exposing its
  invitation.

Record only pass/fail results and privacy-safe diagnostics. Quest-log
compatibility reports must use **Copy Diagnostics**; never attach the raw logs.
