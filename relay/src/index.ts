import { DurableObject } from "cloudflare:workers";

interface Env { ROOMS: DurableObjectNamespace<EncryptedRoom> }
interface Attachment { roomExpiresAt: number; windowStartedAt: number; messagesInWindow: number }

function roomActive(roomId: string, now = Date.now()) {
  const normalized = roomId.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(roomId.length / 4) * 4, "=");
  const bytes = Uint8Array.from(atob(normalized), (value) => value.charCodeAt(0));
  if (bytes.length !== 20) return false;
  const createdAt = new DataView(bytes.buffer).getUint32(0, false) * 1000;
  return createdAt <= now + 5 * 60_000 && now - createdAt < 3 * 60 * 60 * 1000;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/v1\/rooms\/([A-Za-z0-9_-]{27})$/);
    if (!match) return new Response("Not found", { status: 404 });
    if (!roomActive(match[1])) return new Response("Room expired", { status: 410 });
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket required", { status: 426 });
    return env.ROOMS.getByName(match[1]).fetch(request);
  },
};

export class EncryptedRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= 8) return new Response("Room full", { status: 429 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const now = Date.now();
    const roomId = new URL(request.url).pathname.split("/").at(-1)!;
    const normalized = roomId.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(roomId.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(normalized), (value) => value.charCodeAt(0));
    const roomExpiresAt = new DataView(bytes.buffer).getUint32(0, false) * 1000 + 3 * 60 * 60 * 1000;
    server.serializeAttachment({ roomExpiresAt, windowStartedAt: now, messagesInWindow: 0 } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer) {
    const size = typeof message === "string" ? new TextEncoder().encode(message).byteLength : message.byteLength;
    if (size > 4096) { socket.close(1009, "Message too large"); return; }
    const now = Date.now();
    const attachment = socket.deserializeAttachment() as Attachment;
    if (now >= attachment.roomExpiresAt) { socket.close(1000, "Room expired"); return; }
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
