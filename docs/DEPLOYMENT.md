# VPS deployment

The supported server is the Node 22 relay in `relay/`, packaged by the root
Dockerfile and Compose file. It serves the landing page, phone companion, health
endpoint, and opaque WebSocket rooms. Installers remain on GitHub Releases.

1. Copy `deploy/raid-signal.env.example` to `deploy/raid-signal.env` on the VPS
   and set the domain/proxy values for that host. Set
   `RAID_SIGNAL_RELEASE_TAG` to the immutable release whose installer should be
   offered by the landing page.
2. Ensure the external `shared-proxy` Docker network exists and your reverse
   proxy replaces inbound forwarding headers.
3. Run `RAID_SIGNAL_ENV_FILE=/absolute/path/to/raid-signal.env ops/deploy`.
4. Run `RAID_SIGNAL_HEALTH_URL=http://127.0.0.1:3117/healthz ops/status`.

The image build downloads that tag's `release.json` directly from GitHub
Releases, validates its version, filename, download URL, SHA-256, size, and
publication time, and places it in the built static site. A missing or malformed
manifest fails the deployment instead of publishing stale installer metadata.

Do not commit the real environment file. Keep the service reachable publicly
only through the trusted reverse proxy; the published host port binds to
`127.0.0.1` by default.
