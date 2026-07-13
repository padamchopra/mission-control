import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { handleHookEvent } from "./events.js";
import { removeWorktree, resolveLinks, worktreeInfo } from "./git.js";
import { MAX_UPLOAD_BYTES, saveUpload } from "./uploads.js";
import { registry } from "./registry.js";
import { attachStream } from "./stream.js";
import { addWorkspace, listWorkspaces, openSessionInWorkspace, removeWorkspace } from "./workspaces.js";
import {
  assertValidName,
  capturePane,
  killSession,
  listSessions,
  paneCurrentPath,
  paneInCopyMode,
  renameSession,
  scroll,
  sendKeys,
  sendText,
  type ScrollAction,
} from "./tmux.js";

// tmux only preserves the non-printable field separator we use in `-F` formats
// under a UTF-8 locale. launchd runs with a stripped environment (no LANG), so
// without this tmux would mangle the separator and every session's fields would
// collapse into one. Force a UTF-8 locale unless one is already set.
if (!process.env.LANG && !process.env.LC_ALL && !process.env.LC_CTYPE) {
  process.env.LANG = "en_US.UTF-8";
}

const MAX_BODY_BYTES = 256 * 1024;

// Bearer header only — never a query param, so the token can't leak into
// request logs (the WS upgrade carries it in the same header).
function authorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const a = Buffer.from(presented);
  const b = Buffer.from(config.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) });
  res.end(payload);
}

function readRawBody(req: IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        reject(new Error("upload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
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

    if (url.pathname === "/workspaces" && req.method === "GET") {
      return json(res, 200, { workspaces: listWorkspaces() });
    }
    if (url.pathname === "/workspaces" && req.method === "POST") {
      const body = await readJson(req);
      return json(res, 200, { workspace: addWorkspace(String(body.name ?? ""), String(body.path ?? "")) });
    }
    if (parts[0] === "workspaces" && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      if (req.method === "DELETE" && parts.length === 2) {
        removeWorkspace(id);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && parts[2] === "session") {
        return json(res, 200, { name: await openSessionInWorkspace(id) });
      }
    }

    if (req.method === "POST" && url.pathname === "/worktree/remove") {
      const body = await readJson(req);
      await removeWorktree(String(body.path ?? ""), body.force === true);
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
      if (req.method === "POST" && parts[2] === "scroll") {
        const body = await readJson(req);
        const lines = Number(body.lines ?? 1);
        const inCopyMode = await scroll(name, String(body.action ?? "") as ScrollAction, lines);
        return json(res, 200, { ok: true, inCopyMode });
      }
      if (req.method === "GET" && parts[2] === "mode") {
        return json(res, 200, { inCopyMode: await paneInCopyMode(name) });
      }
      if (req.method === "GET" && parts[2] === "links") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        return json(res, 200, await resolveLinks(cwd, registry.view(name)?.claudeSessionId));
      }
      if (req.method === "GET" && parts[2] === "worktree") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        return json(res, 200, await worktreeInfo(cwd));
      }
      if (req.method === "GET" && parts[2] === "cwd") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd ?? null;
        return json(res, 200, { path: cwd });
      }
      if (req.method === "POST" && parts[2] === "rename") {
        const body = await readJson(req);
        const newName = String(body.name ?? "").trim();
        await renameSession(name, newName);
        registry.rename(name, newName);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && parts[2] === "workspace") {
        const body = await readJson(req);
        // The client sends the (possibly edited) path it showed the user;
        // fall back to resolving the session's cwd for older clients.
        const requested = typeof body.path === "string" && body.path.trim() ? body.path.trim() : undefined;
        const cwd = requested ?? (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        if (!cwd) throw new Error("could not resolve session directory");
        return json(res, 200, { workspace: addWorkspace(String(body.name ?? name), cwd) });
      }
      if (req.method === "POST" && parts[2] === "upload") {
        const filename = String(req.headers["x-filename"] ?? "upload.bin");
        const data = await readRawBody(req, MAX_UPLOAD_BYTES);
        return json(res, 200, { path: saveUpload(name, filename, data) });
      }
      if (req.method === "DELETE" && parts.length === 2) {
        await killSession(name);
        registry.remove(name);
        return json(res, 200, { ok: true });
      }
    }

    json(res, 404, { error: "not found" });
  } catch (err) {
    // Log the detail; return a generic message so internal paths/errors don't leak.
    console.error("request error:", err);
    json(res, 500, { error: "internal error" });
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

// Loopback-only. External reach comes solely through `tailscale serve`, which
// terminates TLS and restricts access to the tailnet — the process is never
// exposed on the LAN or any public interface.
server.listen(config.port, "127.0.0.1", () => {
  console.log(`mission-control server listening on 127.0.0.1:${config.port}`);
});
