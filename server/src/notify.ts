import type { WebSocket } from "ws";
import { config } from "./config.js";

export interface NotifyEvent {
  session: string;
  title: string;
  message: string;
  highPriority: boolean;
}

const THROTTLE_MS = 30_000;
const lastSent = new Map<string, number>();

// Desktop apps hold a WebSocket to /notify/stream while running. If any is
// connected, notifications go to them (shown as native banners) instead of
// ntfy — so the phone only buzzes when no desktop client is around. iOS can't
// keep a background socket, so a connected socket really means "a desktop
// app is open".
const clients = new Set<WebSocket>();
const alive = new WeakSet<WebSocket>();

export function attachNotifyStream(ws: WebSocket): void {
  clients.add(ws);
  alive.add(ws);
  ws.on("pong", () => alive.add(ws));
  ws.on("close", () => clients.delete(ws));
  ws.on("error", () => clients.delete(ws));
}

// A half-dead socket (slept laptop, dropped VPN) would swallow notifications:
// still "connected" so ntfy is skipped, but nothing arrives. Ping regularly
// and drop clients that stop ponging, so delivery falls back to the phone.
setInterval(() => {
  for (const ws of clients) {
    if (!alive.has(ws)) {
      clients.delete(ws);
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, 30_000).unref();

export async function sendNotification(evt: NotifyEvent): Promise<void> {
  const throttleKey = `${evt.session}:${evt.title}`;
  const now = Date.now();
  if (now - (lastSent.get(throttleKey) ?? 0) < THROTTLE_MS) return;
  lastSent.set(throttleKey, now);

  if (clients.size > 0) {
    const payload = JSON.stringify({ type: "notification", ...evt });
    for (const ws of clients) {
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
        Click: `missioncontrol://session/${encodeURIComponent(evt.session)}`,
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
