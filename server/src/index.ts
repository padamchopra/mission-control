import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { handleHookEvent } from "./events.js";
import { registry } from "./registry.js";
import { attachStream } from "./stream.js";
import { assertValidName, capturePane, killSession, listSessions, sendKeys, sendText } from "./tmux.js";

const MAX_BODY_BYTES = 256 * 1024;

function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const url = new URL(req.url ?? "/", "http://localhost");
  const presented = header.startsWith("Bearer ")
    ? header.slice("Bearer ".length)
    : (url.searchParams.get("token") ?? "");
  const a = Buffer.from(presented);
  const b = Buffer.from(config.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      const sessions = await listSessions();
      return json(res, 200, {
        sessions: sessions.map((s) => ({ ...s, ...(registry.view(s.name) ?? { state: "unknown" }) })),
      });
    }

    if (req.method === "POST" && url.pathname === "/events") {
      const session = url.searchParams.get("session") ?? "";
      const event = url.searchParams.get("event") ?? "";
      assertValidName(session);
      await handleHookEvent(session, event, await readJson(req));
      return json(res, 200, { ok: true });
    }

    if (parts[0] === "sessions" && parts.length >= 2) {
      const name = decodeURIComponent(parts[1]);
      assertValidName(name);

      if (req.method === "GET" && parts[2] === "snapshot") {
        const lines = Number(url.searchParams.get("lines") ?? 120);
        return json(res, 200, { text: await capturePane(name, lines) });
      }
      if (req.method === "POST" && parts[2] === "text") {
        const body = await readJson(req);
        await sendText(name, String(body.text ?? ""), body.submit !== false);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && parts[2] === "keys") {
        const body = await readJson(req);
        await sendKeys(name, Array.isArray(body.keys) ? body.keys.map(String) : []);
        return json(res, 200, { ok: true });
      }
      if (req.method === "DELETE" && parts.length === 2) {
        await killSession(name);
        registry.remove(name);
        return json(res, 200, { ok: true });
      }
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    json(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const isStream = parts.length === 3 && parts[0] === "sessions" && parts[2] === "stream";
  if (!isStream || !authorized(req)) {
    socket.destroy();
    return;
  }
  const name = decodeURIComponent(parts[1]);
  wss.handleUpgrade(req, socket, head, (ws) => attachStream(ws, name, url.searchParams));
});

server.listen(config.port, () => {
  console.log(`mission-control server listening on :${config.port}`);
});
