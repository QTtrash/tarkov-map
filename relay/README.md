# Encrypted squad relay

This Cloudflare Worker relays opaque WebSocket frames between at most eight clients in one room. The room key stays in the invitation URL fragment and is never sent to this service. The relay stores no messages, screenshots, coordinates, account IDs, or room history.

Before production deployment, configure a dedicated domain, Cloudflare account, privacy policy, abuse monitoring, budget alerts, and a retention policy for provider-level request logs. Run `npm install`, `npx wrangler deploy --dry-run`, then `npm run deploy` from this directory. The desktop hosted-relay control must remain disabled until that endpoint is configured and verified.
