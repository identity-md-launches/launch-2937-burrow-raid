import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { RoomService, type Room } from "./rooms";

export function createRaidServer(
  options: {
    port?: number;
    host?: string;
    origins?: string[];
    telemetryFetch?: typeof fetch;
  } = {},
) {
  const service = new RoomService(Date.now, options.telemetryFetch);
  const dist = resolve("dist");
  const origins = options.origins ?? [];
  const server = createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: service.rooms.size, cap: 3 }));
      return;
    }
    try {
      const path = decodeURIComponent((req.url || "/").split("?")[0]);
      const file = resolve(dist, "." + (path === "/" ? "/index.html" : path));
      if (!file.startsWith(dist + sep)) {
        res.writeHead(403);
        res.end();
        return;
      }
      const body = await readFile(file);
      const mime: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
        ".md": "text/markdown; charset=utf-8",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 2048,
    perMessageDeflate: false,
  });
  const ips = new Map<
    string,
    { tokens: number; at: number; connections: number }
  >();
  const gateTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, v] of ips)
      if (v.connections === 0 && now - v.at > 60000) ips.delete(ip);
  }, 60000);
  gateTimer.unref();
  server.on("upgrade", (req, socket, head) => {
    const origin = req.headers.origin;
    if (
      req.url !== "/rooms" ||
      (origins.length > 0 && (!origin || !origins.includes(origin)))
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
      socket.destroy();
      return;
    }
    const ip = req.socket.remoteAddress || "unknown",
      now = Date.now();
    let gate = ips.get(ip);
    if (!gate) {
      if (ips.size >= 4096) {
        socket.destroy();
        return;
      }
      gate = { tokens: 12, at: now, connections: 0 };
      ips.set(ip, gate);
    }
    gate.tokens = Math.min(12, gate.tokens + (now - gate.at) / 5000);
    gate.at = now;
    if (gate.tokens < 1 || gate.connections >= 6) {
      socket.write("HTTP/1.1 429 Too Many Requests\r\nRetry-After: 5\r\n\r\n");
      socket.destroy();
      return;
    }
    gate.tokens--;
    gate.connections++;
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.once("close", () => {
        gate!.connections = Math.max(0, gate!.connections - 1);
      });
      wss.emit("connection", ws, req);
    });
  });
  wss.on("connection", (ws) => {
    let session: {
      room: Room;
      seat: Room["seats"] extends Map<string, infer S> ? S : never;
    } | null = null;
    let tokens = 45,
      last = Date.now(),
      alive = true;
    const joinTimeout = setTimeout(() => {
      if (!session) ws.close(1008, "Join a room first");
    }, 10000);
    ws.on("pong", () => {
      alive = true;
    });
    const heartbeat = setInterval(() => {
      if (!alive) {
        ws.terminate();
        return;
      }
      alive = false;
      ws.ping();
    }, 15000);
    ws.on("message", (data) => {
      const now = Date.now();
      tokens = Math.min(45, tokens + ((now - last) / 1000) * 30);
      last = now;
      if (--tokens < 0) {
        ws.close(1008, "Message rate exceeded");
        return;
      }
      let v: Record<string, unknown>;
      try {
        v = JSON.parse(data.toString());
        if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error();
      } catch {
        ws.close(1008, "Invalid message");
        return;
      }
      if (!session) {
        if (v.op !== "join") {
          ws.close(1008, "Join first");
          return;
        }
        session = service.join(ws, v);
        if (session) clearTimeout(joinTimeout);
        return;
      }
      if (v.op === "input") service.input(session.room, session.seat, v);
      else if (["start", "replay", "away", "back"].includes(String(v.op)))
        service.action(session.room, session.seat, String(v.op));
    });
    ws.on("close", () => {
      clearTimeout(joinTimeout);
      clearInterval(heartbeat);
      if (session) service.disconnect(session.room, session.seat, ws);
    });
    ws.on("error", () => {});
  });
  service.start();
  return {
    server,
    wss,
    service,
    listen: () =>
      new Promise<number>((resolve) =>
        server.listen(options.port ?? 8080, options.host ?? "0.0.0.0", () =>
          resolve((server.address() as { port: number }).port),
        ),
      ),
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(gateTimer);
        service.stop();
        for (const c of wss.clients) c.terminate();
        wss.close();
        server.close(() => resolve());
      }),
  };
}
if (process.argv[1] && /[/\\](index\.ts|index\.mjs)$/.test(process.argv[1])) {
  const raid = createRaidServer({
    port: Number(process.env.PORT) || 8080,
    host: process.env.HOST || "0.0.0.0",
    origins: process.env.ALLOWED_ORIGINS?.split(",").filter(Boolean),
  });
  raid
    .listen()
    .then((port) =>
      console.log(
        `Burrow Raid server listening on port ${port}. No persistent storage. Configure ALLOWED_ORIGINS before public hosting.`,
      ),
    );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.on(signal, () => {
      void raid.close().then(() => process.exit(0));
    });
}
