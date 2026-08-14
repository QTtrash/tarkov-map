# VPS deployment

The supported server is the Node 22 relay in `relay/`, packaged by the root
Dockerfile and Compose file. It serves the landing page, phone companion, health
endpoint, and opaque WebSocket rooms. Installers remain on GitHub Releases.

1. Copy `deploy/raid-signal.env.example` to `deploy/raid-signal.env` on the VPS
   and set the domain/proxy values for that host.
2. Ensure the external `shared-proxy` Docker network exists and your reverse
   proxy replaces inbound forwarding headers.
3. Run `RAID_SIGNAL_ENV_FILE=/absolute/path/to/raid-signal.env ops/deploy`.
4. Run `RAID_SIGNAL_HEALTH_URL=http://127.0.0.1:3117/healthz ops/status`.

Do not commit the real environment file. Keep the service reachable publicly
only through the trusted reverse proxy; the published host port binds to
`127.0.0.1` by default.
