# SignPath Foundation eligibility preflight

Do not add SignPath credentials, signing actions, or signed-release claims until
SignPath Foundation confirms this project's eligibility in writing.

## Application facts

- Project: Raid Signal
- Project handle: `raid-signal`
- Homepage: <https://signal.mouchsiadis-solutions.com>
- Repository: <https://github.com/QTtrash/tarkov-map>
- Current release: <https://github.com/QTtrash/tarkov-map/releases/tag/v1.2.0>
- Distribution: Windows NSIS installer built on a GitHub-hosted Windows runner
- Original code license: Apache-2.0
- Asset boundary: bundled community map artwork is CC BY-NC-SA 4.0 and other
  data remains under the terms recorded in `ASSET_LICENSES.md`
- Release controls: protected `v*` tags, required GitHub release-environment
  approval, CI, CodeQL, secret scans, Rust audit, Microsoft Defender, ClamAV,
  SHA-256, SPDX SBOM, and GitHub artifact provenance
- Maintainer roles: `QTtrash` is currently the sole committer, reviewer, and
  release approver; outside contributions require maintainer review
- Privacy policy: `PRIVACY.md`

## Questions that require written confirmation

1. Does the separately licensed CC BY-NC-SA map artwork make the installer
   ineligible under the requirement that all components use OSI-approved
   licenses, even though the original application code is Apache-2.0 and the
   asset boundary is explicit?
2. Is a newly public project with an immutable release and verified release
   controls sufficient for SignPath Foundation's executable-project reputation
   requirement?
3. May one maintainer hold the committer/reviewer/approver roles while every
   outside contribution and every signing request still receives manual review?
4. What supported artifact configuration signs and verifies both the inner
   Tauri application executable and the outer NSIS installer?

Submit these facts and questions through the
[SignPath Foundation application](https://signpath.org/apply.html). Confirm that
all maintainers use multi-factor authentication before submitting.

## If accepted

1. Add the required public **Code signing policy** with named roles, the privacy
   policy, and the exact SignPath credit required by the Foundation.
2. Install the SignPath GitHub App and protect `.signpath/policies/**` with
   CODEOWNERS.
3. Store the submission token in the protected GitHub `release` environment and
   pin the SignPath action to a reviewed commit.
4. Submit the GitHub-hosted unsigned artifact for manual approval, retrieve the
   signed artifact, and verify publisher and timestamp on the installer and
   installed executable.
5. Generate checksums and the release manifest only after signing, scan the
   signed installer with Defender and ClamAV, attest the final files, and publish
   a new patch release. Never replace assets attached to an immutable release.

If SignPath declines the application, retain the existing checksum, SBOM,
provenance, malware scans, and explicit unsigned-installer warning. Removing or
replacing map assets is a separate product decision.
