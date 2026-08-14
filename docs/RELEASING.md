# Releasing

Official installers are built only by `.github/workflows/release.yml` from a
protected `vMAJOR.MINOR.PATCH` tag whose version matches both package manifests.

1. Merge all release changes through required checks and finalize `CHANGELOG.md`.
2. Confirm the GitHub `release` environment requires maintainer approval.
3. Create the protected tag on the intended `main` commit.
4. Approve the environment only after CI tests, Microsoft Defender, and ClamAV
   pass.
5. Verify the GitHub Release contains the installer, checksum, release manifest,
   SPDX SBOM, and provenance attestation.
6. Install and launch the downloaded artifact on a clean Windows environment.

Do not upload a locally built replacement to an existing release. If an artifact
is wrong, publish a new patch version.

The current installer is unsigned. Before integrating SignPath Foundation or
making code-signing claims, complete the eligibility gate in
[`SIGNPATH_PREFLIGHT.md`](SIGNPATH_PREFLIGHT.md). A signed installer must be
published as a new version; immutable release assets are never replaced.
