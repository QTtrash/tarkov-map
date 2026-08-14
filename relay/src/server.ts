import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, isAbsolute, normalize, relative, resolve } from "node:path";
import { WebSocket, WebSocketServer, type RawData } from "ws";
import { roomExpiresAt } from "./room-id.js";

const PORT = Number(process.env.PORT || 3000);
const STATIC_ROOT = resolve(process.env.STATIC_ROOT || "/app/web");
const MAX_ROOMS = 64;
const MAX_CONNECTIONS = 512;
const MAX_ROOM_CONNECTIONS = 8;
const MAX_IP_CONNECTIONS = 16;
const MAX_MESSAGE_BYTES = 4096;
const MAX_UPGRADE_IPS = 4096;
const UPGRADE_WINDOW_MS = 60_000;
const rooms = new Map<string, Set<WebSocket>>();
const ipConnections = new Map<string, number>();
const upgrades = new Map<string, { startedAt: number; count: number }>();
const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });
interface RoomSocket extends WebSocket {
  roomContext?: { roomId: string; expiresAt: number; ip: string };
}

function clientIp(request: IncomingMessage) {
  // This service is reachable publicly only through Caddy on shared-proxy;
  // its localhost port is host-local. Caddy replaces untrusted inbound XFF.
  const forwarded = request.headers["x-forwarded-for"];
  const value = Array.isArray(forwarded) ? forwarded.at(-1) : forwarded?.split(",").at(-1);
  return value?.trim() || request.socket.remoteAddress || "unknown";
}

function allowUpgrade(ip: string, now = Date.now()) {
  for (const [candidate, window] of upgrades) {
    if (now - window.startedAt >= UPGRADE_WINDOW_MS) upgrades.delete(candidate);
  }
  const current = upgrades.get(ip);
  if (!current) {
    if (upgrades.size >= MAX_UPGRADE_IPS) return false;
    upgrades.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

function securityHeaders(response: ServerResponse) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  // Leaflet positions tiles and markers with runtime style attributes; scripts remain self-hosted.
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self' wss:; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function sendFile(request: IncomingMessage, response: ServerResponse, path: string) {
  const type =
    (
      {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".exe": "application/vnd.microsoft.portable-executable",
      } as Record<string, string>
    )[extname(path)] || "application/octet-stream";
  response.statusCode = 200;
  response.setHeader("Content-Type", type);
  response.setHeader(
    "Cache-Control",
    path.endsWith(".html") || path.endsWith("release.json") ? "no-store" : "public, max-age=86400",
  );
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(path);
  stream.on("error", (error) => {
    console.error(JSON.stringify({ event: "file-stream-error", path: extname(path), error: error.message }));
    if (!response.headersSent) {
      response.statusCode = 500;
      response.end("Internal server error");
    } else {
      response.destroy(error);
    }
  });
  stream.pipe(response);
}

function handleRequest(request: IncomingMessage, response: ServerResponse) {
  securityHeaders(response);
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.statusCode = 405;
    response.setHeader("Allow", "GET, HEAD");
    response.end("Method not allowed");
    return;
  }
  let url: URL;
  try {
    url = new URL(request.url || "/", "http://localhost");
  } catch {
    response.statusCode = 400;
    response.end("Bad request");
    return;
  }
  if (url.pathname === "/healthz") {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        status: "ok",
        rooms: rooms.size,
        connections: [...rooms.values()].reduce((sum, room) => sum + room.size, 0),
      }),
    );
    return;
  }
  let relative: string;
  try {
    relative =
      url.pathname === "/"
        ? "signal.html"
        : /^\/room\/[A-Za-z0-9_-]{27}\/?$/.test(url.pathname)
          ? "companion.html"
          : decodeURIComponent(url.pathname.slice(1));
  } catch {
    response.statusCode = 400;
    response.end("Bad request");
    return;
  }
  relative = normalize(relative).replace(/^([.][.][/\\])+/, "");
  const path = resolve(STATIC_ROOT, relative);
  const fromRoot = relativePath(STATIC_ROOT, path);
  try {
    if (
      !fromRoot ||
      fromRoot.startsWith("..") ||
      isAbsolute(fromRoot) ||
      !existsSync(path) ||
      !statSync(path).isFile()
    ) {
      response.statusCode = 404;
      response.end("Not found");
      return;
    }
  } catch {
    response.statusCode = 404;
    response.end("Not found");
    return;
  }
  sendFile(request, response, path);
}

function relativePath(root: string, path: string) {
  return relative(root, path);
}

const server = createServer((request, response) => {
  try {
    handleRequest(request, response);
  } catch (error) {
    console.error(
      JSON.stringify({ event: "request-error", error: error instanceof Error ? error.message : String(error) }),
    );
    if (!response.headersSent) {
      response.statusCode = 500;
      response.end("Internal server error");
    } else {
      response.destroy();
    }
  }
});

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", "http://localhost");
  const match = url.pathname.match(/^\/v1\/rooms\/([A-Za-z0-9_-]{27})$/);
  const ip = clientIp(request);
  const total = [...rooms.values()].reduce((sum, room) => sum + room.size, 0);
  let expiresAt = 0;
  try {
    if (match) expiresAt = roomExpiresAt(match[1]);
  } catch {
    /* rejected below */
  }
  const roomId = match?.[1];
  const room = roomId ? rooms.get(roomId) : undefined;
  const accepted =
    roomId &&
    expiresAt > Date.now() &&
    allowUpgrade(ip) &&
    total < MAX_CONNECTIONS &&
    (ipConnections.get(ip) || 0) < MAX_IP_CONNECTIONS &&
    (room?.size || 0) < MAX_ROOM_CONNECTIONS &&
    (room || rooms.size < MAX_ROOMS);
  if (!accepted) {
    socket.write("HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(request, socket, head, (webSocket: RoomSocket) => {
    webSocket.roomContext = { roomId, expiresAt, ip };
    wss.emit("connection", webSocket, request);
  });
});

wss.on("connection", (webSocket: WebSocket) => {
  const socket = webSocket as RoomSocket;
  const context = socket.roomContext;
  if (!context) {
    socket.close(1011, "Room context unavailable");
    return;
  }
  const room = rooms.get(context.roomId) || new Set<WebSocket>();
  rooms.set(context.roomId, room);
  room.add(socket);
  ipConnections.set(context.ip, (ipConnections.get(context.ip) || 0) + 1);
  let windowStartedAt = Date.now();
  let messages = 0;
  let alive = true;
  socket.on("pong", () => {
    alive = true;
  });
  const expiry = setTimeout(() => socket.close(1000, "Room expired"), Math.max(1, context.expiresAt - Date.now()));
  socket.on("message", (message: RawData) => {
    const payload = Array.isArray(message) ? Buffer.concat(message) : message;
    const now = Date.now();
    if (payload.byteLength > MAX_MESSAGE_BYTES) {
      socket.close(1009, "Message too large");
      return;
    }
    if (now - windowStartedAt >= 1000) {
      windowStartedAt = now;
      messages = 0;
    }
    messages += 1;
    if (messages > 10) {
      socket.close(1008, "Rate limit exceeded");
      return;
    }
    for (const peer of room)
      if (peer !== socket && peer.readyState === WebSocket.OPEN) peer.send(payload, { binary: true });
  });
  const heartbeat = setInterval(() => {
    if (!alive) {
      socket.terminate();
      return;
    }
    alive = false;
    socket.ping();
  }, 30_000);
  socket.on("close", () => {
    clearTimeout(expiry);
    clearInterval(heartbeat);
    room.delete(socket);
    if (!room.size) rooms.delete(context.roomId);
    const count = (ipConnections.get(context.ip) || 1) - 1;
    if (count > 0) ipConnections.set(context.ip, count);
    else ipConnections.delete(context.ip);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  const address = server.address();
  console.log(
    JSON.stringify({ event: "raid-signal-ready", port: typeof address === "object" && address ? address.port : PORT }),
  );
});
