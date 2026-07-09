import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface NotifyEvent {
  session: string;
  title: string;
  message: string;
  tail: string;
}

const THROTTLE_MS = 30_000;
const lastSent = new Map<string, number>();

// Telegram is the day-one channel; APNs slots in here once a push key is
// configured (~/.mission-control/apns.json) and the iOS app registers tokens.
export async function sendNotification(evt: NotifyEvent): Promise<void> {
  const throttleKey = `${evt.session}:${evt.title}`;
  const now = Date.now();
  if (now - (lastSent.get(throttleKey) ?? 0) < THROTTLE_MS) return;
  lastSent.set(throttleKey, now);

  await sendTelegram(evt);
}

interface TelegramCreds {
  token: string;
  chatId: string;
}

function telegramCreds(): TelegramCreds | undefined {
  const file = join(homedir(), ".claude", "telegram.env");
  if (!existsSync(file)) return undefined;
  const vars = new Map<string, string>();
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (match) vars.set(match[1], match[2]);
  }
  const token = vars.get("TELEGRAM_BOT_TOKEN");
  const chatId = vars.get("TELEGRAM_CHAT_ID");
  return token && chatId ? { token, chatId } : undefined;
}

async function sendTelegram(evt: NotifyEvent): Promise<void> {
  const creds = telegramCreds();
  if (!creds) return;
  const body = [evt.title, evt.message, evt.tail ? `\n${evt.tail}` : ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 4000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${creds.token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: creds.chatId, text: body }),
    });
    if (!res.ok) console.error(`telegram send failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    console.error("telegram send failed:", err);
  }
}
