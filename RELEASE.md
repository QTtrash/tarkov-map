# Raid Signal release policy

The manual release procedure is documented in [`docs/RELEASING.md`](docs/RELEASING.md).
The maintainer runs and records these checks; GitHub Actions no longer builds or
publishes releases.

Official installers:

- are built from protected version tags in a clean Windows checkout;
- pass the complete repository gate and packaged build;
- are scanned by Microsoft Defender and ClamAV;
- ship with SHA-256, a release manifest, an SPDX SBOM, and recorded scan results;
- are attached only to immutable GitHub Releases; and
- are never committed to Git or copied to the VPS relay.

Existing releases retain their original provenance attestations. New manual
releases must not claim GitHub Actions build provenance.

The initial public release is unsigned and must be described as such. Unsigned
status is not permission to bypass antivirus or SmartScreen warnings. A detection
blocks publication until a clean rebuild and investigation succeed.
