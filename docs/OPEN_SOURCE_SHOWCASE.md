# Open-source showcase handoff

The repository, Raid Signal site, and Mouchsiadis Solutions site use
`public/images/raid-signal-open-source.png` as the shared 1280x640 launch card.
Keep the wording "Apache-2.0 source code with separately licensed map assets"
near open-source claims so the redistribution boundary remains clear.

## GitHub repository profile

These owner-only settings cannot be represented by a commit:

- Description: `Local-first Windows raid navigator with end-to-end encrypted squad position sharing.`
- Website: `https://signal.mouchsiadis-solutions.com`
- Topics: `tauri`, `rust`, `react`, `windows`, `local-first`, `encryption`,
  `websockets`, `maps`, `escape-from-tarkov`, `open-source`
- Social preview: upload `public/images/raid-signal-open-source.png`
- Enable Discussions before directing users there, and pin the repository on the
  maintainer profile while it is the company's featured open-source release.

## Release and deployment

- Deploy the Raid Signal image with `RAID_SIGNAL_RELEASE_TAG` pinned to the
  immutable release being advertised. The build fails if the release manifest
  is unavailable or malformed.
- Publish release notes from `.github/RELEASE_NOTES.md`; checksums, the manifest,
  SBOM, scans, and provenance remain release evidence rather than security-audit
  claims.
- Deploy the Mouchsiadis Solutions site after all four localized builds pass.
- For a new release, update version-specific evidence and publish a new immutable
  tag. Never replace v1.0.0 assets.

## SignPath

Complete `SIGNPATH_PREFLIGHT.md` before applying. Do not add a signing badge,
publisher claim, workflow credentials, or SignPath action until the Foundation
confirms eligibility for the complete installer in writing.
