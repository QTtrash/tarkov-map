# Raid Signal opaque relay

The production VPS service serves the Raid Signal landing page, hosted phone companion, verified release downloads, health endpoint, and WebSocket rooms. The relay never receives the invitation fragment/key and never parses encrypted position messages.

Transport limits:

- 8 connections per room
- 3-hour timestamped room lifetime
- 4 KB messages
- 10 messages per second per client
- 64 rooms, 512 connections, and 16 connections per source IP per process
- 30 WebSocket upgrades per source IP per minute

There is no database, room history, or last-message cache. Logs contain startup and process errors only; room IDs, payloads, positions, and client addresses are not logged.

`src/server.ts` is the Node 22 VPS implementation. `src/index.ts` keeps the portable Cloudflare Durable Object adapter. Run `npm test` and `npm run build:server` from this directory.
