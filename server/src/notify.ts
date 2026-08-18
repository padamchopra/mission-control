import type { WebSocket } from "ws";
import { config } from "./config.js";
import type { RegistryEntry } from "./registry.js";

export interface NotifyEvent {
  session: string;
  title: string;
  message: string;
  highPriority: boolean;
  /// Where tapping the push should land. Defaults to the session deep link;
  /// chats set their own, since they have no tmux session behind them.
  click?: string;
}

const THROTTLE_MS = 5 * 60_000;
const lastSent = new Map<string, number>();

// Every client holds a WebSocket to /notify/stream while it's in the
// foreground: it's the channel that pushes live session state, so clients
// don't have to poll. Two roles ride on the same socket:
//
//   subscribers   — everyone, receives state pushes and settings sync.
//   notifyTargets — clients that render notifications themselves (the desktop
//                   app). If any is connected, notifications go there as
//                   native banners instead of ntfy, so the phone only buzzes
//                   when no desktop client is around.
//
// The phone connects with `?notify=0`: it wants the live data but its
// notifications arrive via ntfy, so it must not count as a delivery target.
const subscribers = new Set<WebSocket>();
const notifyTargets = new Set<WebSocket>();
const alive = new WeakSet<WebSocket>();

export function attachNotifyStream(ws: WebSocket, notifies: boolean): void {
  subscribers.add(ws);
  if (notifies) notifyTargets.add(ws);
  alive.add(ws);
  ws.on("pong", () => alive.add(ws));
  const drop = () => {
    subscribers.delete(ws);
    notifyTargets.delete(ws);
  };
  ws.on("close", drop);
  ws.on("error", drop);
  // Announce that this server pushes state. A client talking to an older
  // server never hears this and keeps polling fast, so it degrades instead of
  // going quietly stale.
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type: "hello", push: true }));
}

// Push an arbitrary message to every connected client. Used for live state and
// settings sync (e.g. quick replies) so a change shows up on every open device
// without a poll. Unlike notifications this never falls back to ntfy — a client
// that isn't connected just picks it up on its next refresh.
export function broadcast(payload: unknown): void {
  if (subscribers.size === 0) return;
  const text = JSON.stringify(payload);
  for (const ws of subscribers) {
    if (ws.readyState === ws.OPEN) ws.send(text);
  }
}

// A session's hook-driven state changed. Clients patch the session in place —
// no refetch — so a fleet card's live label tracks the agent in real time.
// Mirrors the registry exactly: an absent field means "cleared".
export function pushSession(session: string, entry: RegistryEntry | undefined): void {
  broadcast({
    type: "session",
    session,
    agent: entry?.agent,
    state: entry?.state,
    detail: entry?.detail,
    currentAction: entry?.currentAction,
    interactionKind: entry?.interactionKind,
    interactionRequestId: entry?.interactionRequestId,
  });
}

// The set of sessions changed (created, killed, renamed, or a new agent
// session started in one). Clients refetch the list, which carries the fields
// only /sessions can produce — pane preview and diff stat.
export function pushSessionList(): void {
  broadcast({ type: "sessions" });
}

// A half-dead socket (slept laptop, dropped VPN) would swallow notifications:
// still "connected" so ntfy is skipped, but nothing arrives. Ping regularly
// and drop clients that stop ponging, so delivery falls back to the phone.
setInterval(() => {
  for (const ws of subscribers) {
    if (!alive.has(ws)) {
      subscribers.delete(ws);
      notifyTargets.delete(ws);
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, 30_000).unref();

export async function sendNotification(evt: NotifyEvent): Promise<void> {
  // A title alone is too broad: a new question should still surface, but the
  // exact same event must never reappear because a hook/client retried it.
  const throttleKey = `${evt.session}:${evt.highPriority}:${evt.message}:${evt.title}`;
  const now = Date.now();
  if (now - (lastSent.get(throttleKey) ?? 0) < THROTTLE_MS) return;
  lastSent.set(throttleKey, now);

  if (notifyTargets.size > 0) {
    const payload = JSON.stringify({ type: "notification", ...evt });
    for (const ws of notifyTargets) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
    return;
  }
  await sendNtfy(evt);
}

// Notifications fall back to ntfy. The server just POSTs; the ntfy app on the
// phone shows the push. Tapping it deep-links into the session via Click.
async function sendNtfy(evt: NotifyEvent): Promise<void> {
  if (!config.ntfyTopic) return;
  try {
    const res = await fetch(`${config.ntfyServer.replace(/\/$/, "")}/${config.ntfyTopic}`, {
      method: "POST",
      headers: {
        Title: sanitizeHeader(evt.title),
        Click: evt.click ?? `missioncontrol://session/${encodeURIComponent(evt.session)}`,
        Priority: evt.highPriority ? "high" : "default",
        Tags: evt.highPriority ? "bell" : "white_check_mark",
      },
      body: evt.message || evt.title,
    });
    if (!res.ok) console.error(`ntfy send failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("ntfy send failed:", err);
  }
}

// ntfy header values must be single-line ASCII.
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").slice(0, 200);
}
