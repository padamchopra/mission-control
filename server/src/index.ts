import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { AgentStartupError, AgentUnavailableError, agentKind, inferAgent, type AgentKind } from "./agent.js";
import { archiveChat, deleteArchivedChat, listArchivedChats } from "./archives.js";
import { findProjectFiles, findSkills } from "./discovery.js";
import { handleHookEvent } from "./events.js";
import { attachNotifyStream, broadcast, pushSession, pushSessionList } from "./notify.js";
import {
  createPullRequest,
  diffStatFor,
  mergePullRequest,
  removeWorktree,
  resolveChecks,
  resolveLinks,
  reviewComments,
  worktreeInfo,
} from "./git.js";
import { buildInbox } from "./inbox.js";
import { listAuthoredPullRequests } from "./pull-requests.js";
import { createLoop, deleteLoop, listLoops, runLoop, startLoopScheduler, updateLoop } from "./loops.js";
import { highlightedIndex, parsePanePrompt } from "./prompt.js";
import { MAX_UPLOAD_BYTES, saveUpload } from "./uploads.js";
import { registry, type PendingMessage } from "./registry.js";
import { getQuickReplies, setQuickReplies } from "./settings.js";
import { attachStream } from "./stream.js";
import { readContextUsage, readConversation, resolveTranscriptPath, type Conversation } from "./transcript.js";
import {
  addWorkspace,
  closeAllWorkspaceWorktrees,
  closeWorkspaceWorktree,
  createTaskSession,
  listWorkspaces,
  openPullRequestSession,
  openSessionInWorkspace,
  removeWorkspace,
  worktreeDirtyMap,
} from "./workspaces.js";
import { startServerUpdate, updateStatus } from "./update.js";
import {
  assertValidName,
  capturePane,
  killSession,
  listSessions,
  newShellSession,
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

// Which recorded prompts are still queued. A queued prompt counts as delivered
// only once it appears in the transcript as a real user turn — testing for that
// rather than trusting a hook means it doesn't matter whether UserPromptSubmit
// fires when a prompt is queued or when Claude finally picks it up.
function reconcilePending(name: string, conversation: Conversation): PendingMessage[] | undefined {
  const pending = registry.pending(name);
  if (pending.length === 0) return undefined;
  const delivered = new Set<string>();
  for (const p of pending) {
    if (conversation.entries.some((e) => e.kind === "user" && sameMessage(e.text, p.text))) {
      delivered.add(p.text);
    }
  }
  if (delivered.size > 0) registry.dropPending(name, [...delivered]);
  const remaining = pending.filter((p) => !delivered.has(p.text));
  return remaining.length > 0 ? remaining : undefined;
}

// A pane capture is padded to the terminal's width and height. Strip the trailing
// blank rows and per-line padding so the prompt renders as a card rather than a
// rectangle of whitespace, and drop the composer chrome at the foot of the pane.
function trimPane(text: string): string | undefined {
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  while (lines.length && !lines[0]) lines.shift();
  const trimmed = lines.join("\n");
  return trimmed.trim() ? trimmed : undefined;
}

// The transcript clips long messages and normalises nothing, so match on a
// whitespace-collapsed prefix rather than the whole string.
function sameMessage(transcriptText: string | undefined, queued: string): boolean {
  if (!transcriptText) return false;
  const key = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 160);
  return key(transcriptText) === key(queued);
}

const server = createServer(async (req, res) => {
  try {
    if (!authorized(req)) return json(res, 401, { error: "unauthorized" });

    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, { ok: true });
    }

    if (url.pathname === "/server/update" && req.method === "GET") {
      return json(res, 200, updateStatus());
    }
    if (url.pathname === "/server/update" && req.method === "POST") {
      return json(res, 202, startServerUpdate());
    }

    // Composer quick replies, shared across every client connected to this server.
    if (url.pathname === "/quick-replies" && req.method === "GET") {
      return json(res, 200, { replies: getQuickReplies() });
    }
    if (url.pathname === "/quick-replies" && req.method === "PUT") {
      const body = await readJson(req);
      const replies = setQuickReplies(body.replies);
      // Live-sync to any desktop client already open on this server.
      broadcast({ type: "quick-replies", replies });
      return json(res, 200, { replies });
    }

    // Every session that's waiting on a human decision, with the context needed
    // to make it — the fleet's to-do queue in one request.
    if (req.method === "GET" && url.pathname === "/inbox") {
      return json(res, 200, { items: await buildInbox() });
    }

    if (req.method === "GET" && url.pathname === "/pull-requests") {
      return json(res, 200, {
        pullRequests: await listAuthoredPullRequests(url.searchParams.get("refresh") === "1"),
      });
    }

    if (req.method === "GET" && url.pathname === "/sessions") {
      const sessions = await listSessions();
      return json(res, 200, {
        sessions: await Promise.all(sessions.map(async (s) => {
          const entry = registry.view(s.name);
          const agent = inferAgent(s.paneCommand, entry?.agent);
          return {
            ...s,
            ...(entry ?? { state: "unknown" }),
            agent,
            // A short pane capture gives the fleet view useful context without
            // streaming every terminal or retaining output anywhere else.
            preview: (await capturePane(s.name, 1).catch(() => "")).trim(),
            // Cached per directory, so the fleet poll stays cheap.
            diffStat: await diffStatFor(s.panePath),
            // Cached on transcript size, so an idle session costs a stat().
            context: readContextUsage(
              entry?.transcriptPath ?? resolveTranscriptPath(entry?.cwd, entry?.claudeSessionId),
              config.contextLimit,
            ),
          };
        })),
      });
    }

    if (req.method === "POST" && url.pathname === "/sessions") {
      const body = await readJson(req);
      // `claude` is retained for older app builds. New clients send the
      // provider-neutral `agent` value.
      const agent = agentKind(body.agent, body.claude === true ? "claude" : "shell");
      const name = await newShellSession({
        name: typeof body.name === "string" ? body.name : undefined,
        path: typeof body.path === "string" ? body.path : undefined,
        agent,
      });
      registry.update(name, { agent, state: agent === "shell" ? "unknown" : "working" });
      pushSessionList();
      return json(res, 200, { name });
    }

    if (req.method === "POST" && url.pathname === "/events") {
      const session = url.searchParams.get("session") ?? "";
      const event = url.searchParams.get("event") ?? "";
      const reportedAgent = agentKind(url.searchParams.get("agent"), "claude");
      assertValidName(session);
      await handleHookEvent(session, event, await readJson(req), reportedAgent);
      return json(res, 200, { ok: true });
    }

    if (url.pathname === "/workspaces" && req.method === "GET") {
      return json(res, 200, { workspaces: await listWorkspaces() });
    }

    if (url.pathname === "/loops" && req.method === "GET") {
      return json(res, 200, { loops: listLoops() });
    }

    if (url.pathname === "/archives" && req.method === "GET") {
      return json(res, 200, { archives: listArchivedChats() });
    }
    if (parts[0] === "archives" && parts[1] && req.method === "DELETE") {
      try {
        deleteArchivedChat(decodeURIComponent(parts[1]));
        return json(res, 200, { ok: true });
      } catch (error) {
        return json(res, 404, { error: (error as Error).message || "archived chat not found" });
      }
    }
    if (url.pathname === "/loops" && req.method === "POST") {
      try {
        return json(res, 200, { loop: await createLoop(await readJson(req)) });
      } catch (error) {
        return json(res, 400, { error: (error as Error).message || "could not create loop" });
      }
    }
    if (parts[0] === "loops" && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      if (req.method === "PATCH" && parts.length === 2) {
        try {
          return json(res, 200, { loop: await updateLoop(id, await readJson(req)) });
        } catch (error) {
          return json(res, 400, { error: (error as Error).message || "could not update loop" });
        }
      }
      if (req.method === "DELETE" && parts.length === 2) {
        try {
          deleteLoop(id);
          return json(res, 200, { ok: true });
        } catch (error) {
          return json(res, 404, { error: (error as Error).message || "loop not found" });
        }
      }
      if (req.method === "POST" && parts[2] === "run") {
        try {
          return json(res, 200, await runLoop(id, pushSessionList));
        } catch (error) {
          return json(res, 409, { error: (error as Error).message || "could not run loop" });
        }
      }
    }
    if (url.pathname === "/workspaces" && req.method === "POST") {
      const body = await readJson(req);
      try {
        return json(res, 200, { workspace: await addWorkspace(String(body.name ?? ""), String(body.path ?? "")) });
      } catch (err) {
        return json(res, 400, { error: (err as Error).message || "could not add workspace" });
      }
    }
    if (parts[0] === "workspaces" && parts[1]) {
      const id = decodeURIComponent(parts[1]);
      if (req.method === "DELETE" && parts.length === 2) {
        removeWorkspace(id);
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && parts[2] === "session") {
        const name = await openSessionInWorkspace(id);
        pushSessionList();
        return json(res, 200, { name });
      }
      if (req.method === "POST" && parts[2] === "pull-request-session") {
        const body = await readJson(req);
        try {
          const name = await openPullRequestSession(id, String(body.branch ?? ""), Number(body.number));
          pushSessionList();
          return json(res, 200, { name });
        } catch (error) {
          return json(res, 409, { error: (error as Error).message || "could not open pull request shell" });
        }
      }
      if (req.method === "GET" && parts[2] === "dirty") {
        return json(res, 200, { dirty: await worktreeDirtyMap(id) });
      }
      if (req.method === "POST" && parts[2] === "task") {
        const body = await readJson(req);
        const requested = agentKind(body.agent, "claude");
        const agent: Exclude<AgentKind, "shell"> = requested === "codex" ? "codex" : "claude";
        try {
          const name = await createTaskSession(id, String(body.prompt ?? ""), agent);
          registry.update(name, { agent, state: "working" });
          pushSessionList();
          return json(res, 200, { name });
        } catch (error) {
          if (error instanceof AgentUnavailableError || error instanceof AgentStartupError) {
            pushSessionList();
            return json(res, 409, { error: error.message });
          }
          throw error;
        }
      }
      // Closing a worktree also stops the tmux sessions living inside it.
      if (req.method === "POST" && parts[2] === "worktrees" && parts[3] === "close") {
        const body = await readJson(req);
        const result = await closeWorkspaceWorktree(id, String(body.path ?? ""), body.force === true);
        pushSessionList();
        return json(res, 200, result);
      }
      if (req.method === "POST" && parts[2] === "worktrees" && parts[3] === "close-all") {
        const body = await readJson(req);
        const result = await closeAllWorkspaceWorktrees(id, body.force === true);
        pushSessionList();
        return json(res, 200, result);
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
      if (req.method === "GET" && parts[2] === "activity") {
        return json(res, 200, { activity: registry.view(name)?.activity ?? [] });
      }
      if (req.method === "GET" && parts[2] === "conversation") {
        const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 120), 1), 400);
        const entry = registry.view(name);
        const path = entry?.transcriptPath ?? resolveTranscriptPath(entry?.cwd, entry?.claudeSessionId);
        const conversation = readConversation(path, limit);
        // Attach the live hook state so the feed can show a processing indicator.
        // Guarded on `available` so we never mutate the shared UNAVAILABLE object.
        if (conversation.available) {
      conversation.agent = entry?.agent ?? conversation.agent ?? "claude";
          if (entry?.state) conversation.state = entry.state;
          if (entry?.currentAction) conversation.action = entry.currentAction;
          conversation.context = readContextUsage(path, config.contextLimit);
          conversation.pending = reconcilePending(name, conversation);
          // Waiting on a human, but nothing in the transcript says what for —
          // an open question dialog, whose record Claude Code writes only once
          // it's answered. Show the pane instead of an idle-looking feed.
          if (entry?.state === "needs_input" && !conversation.entries.some((e) => e.kind === "tool" && e.status == null)) {
            const pane = await capturePane(name, 40).catch(() => "");
            conversation.prompt = trimPane(pane);
            // Parsed into the same shape a transcript question produces, so the
            // client renders one card either way. Raw pane stays attached as the
            // fallback for when the dialog doesn't parse.
            conversation.promptQuestion = parsePanePrompt(pane);
          }
        }
        return json(res, 200, conversation);
      }
      if (req.method === "POST" && parts[2] === "archive") {
        const entry = registry.view(name);
        const path = entry?.transcriptPath ?? resolveTranscriptPath(entry?.cwd, entry?.claudeSessionId);
        const conversation = readConversation(path, 400);
        if (!conversation.available) {
          return json(res, 409, { error: "this session has no conversation to archive" });
        }
        conversation.agent = entry?.agent ?? conversation.agent ?? "claude";
        const archive = archiveChat({
          session: name,
          agent: entry?.agent ?? conversation.agent ?? "claude",
          cwd: entry?.cwd ?? null,
          conversation,
        });
        await killSession(name);
        registry.remove(name);
        pushSessionList();
        return json(res, 200, { archive });
      }
      // The live hook state on its own, so a screen that needs only this (the
      // composer, deciding whether a message will queue) doesn't pull the whole
      // conversation or the whole fleet to find out.
      if (req.method === "GET" && parts[2] === "state") {
        const entry = registry.view(name);
        return json(res, 200, {
          state: entry?.state ?? "unknown",
          agent: entry?.agent,
          detail: entry?.detail,
          currentAction: entry?.currentAction,
        });
      }
      if (req.method === "GET" && parts[2] === "notifications") {
        return json(res, 200, { muted: registry.view(name)?.notificationsMuted === true });
      }
      if (req.method === "POST" && parts[2] === "notifications") {
        const body = await readJson(req);
        const muted = body.muted === true;
        registry.setNotificationsMuted(name, muted);
        return json(res, 200, { muted });
      }
      if (req.method === "POST" && parts[2] === "text") {
        const body = await readJson(req);
        const text = String(body.text ?? "");
        const submit = body.submit !== false;
        await sendText(name, text, submit);
        // A prompt submitted mid-turn is queued by Claude Code, not run. Record
        // it so every connected client can show it as pending — not just the one
        // that sent it — and nudge them to look.
        if (
          submit &&
          text.trim() &&
          registry.view(name)?.agent === "claude" &&
          registry.view(name)?.state === "working"
        ) {
          registry.addPending(name, text.trim());
          pushSession(name, registry.view(name));
        }
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && parts[2] === "keys") {
        const body = await readJson(req);
        const keys = Array.isArray(body.keys) ? body.keys.map(String) : [];
        await sendKeys(name, keys);
        // Escape interrupts the turn and discards whatever was queued behind it,
        // so our record of that queue is stale the moment it lands.
        if (keys.some((k) => k.toLowerCase() === "escape")) {
          registry.dropPending(name);
          pushSession(name, registry.view(name));
        }
        return json(res, 200, { ok: true });
      }
      // Pick a specific option in an open dialog. The pane says which row is
      // highlighted, so the arrows needed to reach another one are computable —
      // but only from a fresh read, so the highlight is re-derived here rather
      // than trusted from whatever the client last rendered. Refuses rather than
      // guesses if the pane no longer looks like a choice.
      if (req.method === "POST" && parts[2] === "choose") {
        const body = await readJson(req);
        const target = Number(body.index);
        if (!Number.isInteger(target) || target < 0 || target > 20) {
          return json(res, 400, { error: "invalid option index" });
        }
        const current = highlightedIndex(await capturePane(name, 40));
        if (current == null) {
          return json(res, 409, { error: "no selectable prompt on screen" });
        }
        const steps = target - current;
        const keys = Array(Math.abs(steps)).fill(steps > 0 ? "down" : "up");
        await sendKeys(name, [...keys, "enter"]);
        return json(res, 200, { ok: true, from: current, to: target });
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
        return json(
          res,
          200,
          await resolveLinks(
            cwd,
            registry.view(name)?.claudeSessionId,
            url.searchParams.get("refresh") === "1",
            url.searchParams.get("pr") !== "0",
          ),
        );
      }
      if (req.method === "GET" && parts[2] === "checks") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        return json(res, 200, await resolveChecks(cwd, url.searchParams.get("refresh") === "1"));
      }
      if (req.method === "POST" && parts[2] === "pr" && parts.length === 3) {
        const body = await readJson(req);
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        const title = typeof body.title === "string" ? body.title : undefined;
        const prBody = typeof body.body === "string" ? body.body : undefined;
        return json(res, 200, { url: await createPullRequest(cwd, title, prBody) });
      }
      if (req.method === "POST" && parts[2] === "pr" && parts[3] === "merge") {
        const body = await readJson(req);
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        await mergePullRequest(cwd, body.auto === true);
        return json(res, 200, { ok: true });
      }
      if (req.method === "GET" && parts[2] === "reviews") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        return json(res, 200, { comments: await reviewComments(cwd) });
      }
      if (req.method === "GET" && parts[2] === "worktree") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        return json(res, 200, await worktreeInfo(cwd));
      }
      if (req.method === "GET" && parts[2] === "cwd") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd ?? null;
        return json(res, 200, { path: cwd });
      }
      if (req.method === "GET" && parts[2] === "files") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        if (!cwd) throw new Error("could not resolve session directory");
        return json(res, 200, { files: await findProjectFiles(cwd, url.searchParams.get("q") ?? "") });
      }
      if (req.method === "GET" && parts[2] === "skills") {
        const cwd = (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        if (!cwd) throw new Error("could not resolve session directory");
        return json(res, 200, { skills: await findSkills(cwd, url.searchParams.get("q") ?? "") });
      }
      if (req.method === "POST" && parts[2] === "rename") {
        const body = await readJson(req);
        const newName = String(body.name ?? "").trim();
        await renameSession(name, newName);
        registry.rename(name, newName);
        pushSessionList();
        return json(res, 200, { ok: true });
      }
      if (req.method === "POST" && parts[2] === "workspace") {
        const body = await readJson(req);
        // The client sends the (possibly edited) path it showed the user;
        // fall back to resolving the session's cwd for older clients.
        const requested = typeof body.path === "string" && body.path.trim() ? body.path.trim() : undefined;
        const cwd = requested ?? (await paneCurrentPath(name)) ?? registry.view(name)?.cwd;
        if (!cwd) throw new Error("could not resolve session directory");
        try {
          return json(res, 200, { workspace: await addWorkspace(String(body.name ?? name), cwd) });
        } catch (err) {
          return json(res, 400, { error: (err as Error).message || "could not add workspace" });
        }
      }
      if (req.method === "POST" && parts[2] === "upload") {
        const filename = String(req.headers["x-filename"] ?? "upload.bin");
        const data = await readRawBody(req, MAX_UPLOAD_BYTES);
        return json(res, 200, { path: saveUpload(name, filename, data) });
      }
      if (req.method === "DELETE" && parts.length === 2) {
        await killSession(name);
        registry.remove(name);
        pushSessionList();
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
  const isNotify = parts.length === 2 && parts[0] === "notify" && parts[1] === "stream";
  if ((!isStream && !isNotify) || !authorized(req)) {
    socket.destroy();
    return;
  }
  if (isNotify) {
    // `notify=0` subscribes to live state without becoming a notification
    // target — the phone's role, since its banners come from ntfy. Absent
    // means yes, so an older desktop client keeps receiving them.
    const notifies = url.searchParams.get("notify") !== "0";
    wss.handleUpgrade(req, socket, head, (ws) => attachNotifyStream(ws, notifies));
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
startLoopScheduler(pushSessionList);
