# Security model

## Trust boundaries

- Screenshot names, log contents, settings files, localStorage, bundled JSON,
  Tauri event payloads, invitation URLs, WebSocket frames, HTTP paths, proxy
  headers, and release manifests are untrusted until validated.
- Caddy must replace rather than append untrusted inbound forwarding headers.
- LAN sharing is intended only for a trusted local network; payload encryption
  does not authenticate the HTTP page transport.

## Required properties

- AES-256-GCM keys are generated with a cryptographically secure RNG.
- Nonces are fresh and 96 bits; authenticated data binds ciphertext to protocol
  version and room ID.
- Invitations expire after three hours and future timestamps are rejected.
- The relay logs no room IDs, invitations, IP addresses, payloads, positions, or
  callsigns. Operational errors must contain only safe categories.
- Internet and LAN relays cap clients, payload bytes, and message rate. Public
  upgrade-rate state is time-bounded and size-bounded.
- Static paths are decoded safely, constrained beneath the configured root, and
  served with CSP, `nosniff`, framing, referrer, and permissions headers.
- Settings updates validate before durable writes and preserve a recoverable
  backup of the last good file.
- Quest-log import is opt-in and previewed before the first write. It bounds JSON
  records, accepts only known modes/statuses and exact task identifiers, hashes
  profile IDs before persistence, deduplicates events, skips unattributed input,
  quarantines suspicious quest-start bursts, and never promotes lifecycle hints
  or arbitrary identifiers into progress.
- Copied quest diagnostics contain only application version, path roles, bounded
  counters, and safe status categories. They exclude paths, filenames, profile
  keys, timestamps, fingerprints, and log contents. Raw logs must not be attached
  to public compatibility reports.
- Quest profiles, player levels, and progress remain local. They are not included
  in room protocol v1 and never reach either relay or the phone companion.

Report vulnerabilities through GitHub private vulnerability reporting as
described in the root `SECURITY.md`.
