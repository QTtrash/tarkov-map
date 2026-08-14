# Raid Signal opaque relay

The production VPS service serves the Raid Signal landing page, hosted phone companion, health endpoint, and WebSocket rooms. Installers are distributed only through GitHub Releases. The relay never receives the invitation fragment/key and never parses encrypted position messages.

Transport limits:

- 8 connections per room
- 3-hour timestamped room lifetime
- 4 KB messages
- 10 messages per second per client
- 64 rooms, 512 connections, and 16 connections per source IP per process
- 30 WebSocket upgrades per source IP per minute (using Caddy's trusted `X-Forwarded-For` value)

There is no database, room history, or last-message cache. Logs contain startup and process errors only; room IDs, payloads, positions, and client addresses are not logged.

`src/server.ts` is the supported Node 22 VPS implementation. Run `npm test` and
`npm run build` from this directory. The former experimental Cloudflare adapter
was removed because it did not share the VPS implementation's tests or release
guarantees.
