import { DurableObject } from "cloudflare:workers";

interface Env { ROOMS: DurableObjectNamespace<EncryptedRoom> }
interface Attachment { joinedAt: number; windowStartedAt: number; messagesInWindow: number }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/v1\/rooms\/([A-Za-z0-9_-]{20,32})$/);
    if (!match) return new Response("Not found", { status: 404 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    return env.ROOMS.getByName(match[1]).fetch(request);
  },
};

export class EncryptedRoom extends DurableObject<Env> {
  async fetch(): Promise<Response> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= 8) return new Response("Room full", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const now = Date.now();
    server.serializeAttachment({ joinedAt: now, windowStartedAt: now, messagesInWindow: 0 } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const size = typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (size > 4096) { socket.close(1009, "Message too large"); return; }
    const now = Date.now();
    const attachment = socket.deserializeAttachment() as Attachment;
    if (now - attachment.joinedAt > 3 * 60 * 60 * 1000) { socket.close(1000, "Session expired"); return; }
    if (now - attachment.windowStartedAt >= 1000) {
      attachment.windowStartedAt = now;
      attachment.messagesInWindow = 0;
    }
    attachment.messagesInWindow += 1;
    socket.serializeAttachment(attachment);
    if (attachment.messagesInWindow > 10) { socket.close(1008, "Rate limit exceeded"); return; }
    for (const peer of this.ctx.getWebSockets()) {
      if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(message);
    }
  }

  webSocketClose(socket: WebSocket, code: number, reason: string) {
    socket.close(code, reason);
  }
}
