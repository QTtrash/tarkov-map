# Agent guide

Raid Signal is a Windows Tauri application plus a separately deployed Node.js
relay and static phone companion. Treat this file as an index; follow the linked
documents instead of duplicating their details in prompts or code comments.

## Start here

- `docs/ARCHITECTURE.md` — runtime boundaries, data flow, and module ownership.
- `docs/SECURITY.md` — trust boundaries and invariants that changes must retain.
- `docs/QUALITY.md` — the one-command verification contract and test ownership.
- `CONTRIBUTING.md` — environment setup and pull-request expectations.
- `ASSET_LICENSES.md` — non-code asset scope, provenance, and restrictions.

## Non-negotiable invariants

- Never read game memory, inject input, alter game files, or claim anti-cheat
  approval.
- Invitation keys stay in URL fragments and must never reach or be logged by the
  relay.
- The relay forwards ciphertext only and stores no position history.
- Keep existing settings schema v2 and room protocol v1 compatible.
- Do not commit installers, build outputs, secrets, personal deployment paths,
  or refreshed assets without their hashes and provenance.
- Validate data at every filesystem, storage, native-command, and network
  boundary before treating it as an application type.

## Working loop

1. Read the owning module and its nearest tests before editing.
2. Keep behavior changes separate from formatting and structural extraction.
3. Run the narrowest relevant test while iterating.
4. Run `npm run check:all` before handing work off.
5. Use a Conventional Commit pull-request title and explain why, compatibility,
   security/privacy impact, and validation in the body.
