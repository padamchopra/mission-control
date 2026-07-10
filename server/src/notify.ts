import { config } from "./config.js";

export interface NotifyEvent {
  session: string;
  title: string;
  message: string;
  highPriority: boolean;
}

const THROTTLE_MS = 30_000;
const lastSent = new Map<string, number>();

// Notifications go to ntfy. The server just POSTs; the ntfy app on the phone
// shows the push. Tapping it deep-links into the session via the Click header.
export async function sendNotification(evt: NotifyEvent): Promise<void> {
  if (!config.ntfyTopic) return;

  const throttleKey = `${evt.session}:${evt.title}`;
  const now = Date.now();
  if (now - (lastSent.get(throttleKey) ?? 0) < THROTTLE_MS) return;
  lastSent.set(throttleKey, now);

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
