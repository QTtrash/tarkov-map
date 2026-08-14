# Raid Signal release policy

The executable release procedure is documented in [`docs/RELEASING.md`](docs/RELEASING.md)
and enforced by `.github/workflows/release.yml`.

Official installers:

- are built from protected version tags on clean GitHub-hosted Windows runners;
- pass the complete repository gate and packaged build;
- are scanned by Microsoft Defender and ClamAV;
- ship with SHA-256, SPDX SBOM, and provenance attestation;
- are attached only to immutable GitHub Releases; and
- are never committed to Git or copied to the VPS relay.

The initial public release is unsigned and must be described as such. Unsigned
status is not permission to bypass antivirus or SmartScreen warnings. A detection
blocks publication until a clean rebuild and investigation succeed.
