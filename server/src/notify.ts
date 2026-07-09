import { sendPush } from "./apns.js";

export interface NotifyEvent {
  session: string;
  title: string;
  message: string;
  badge: number;
}

const THROTTLE_MS = 30_000;
const lastSent = new Map<string, number>();

// APNs only. No-op until ~/.mission-control/apns.json + a .p8 key are present
// and the app has registered a device token.
export async function sendNotification(evt: NotifyEvent): Promise<void> {
  const throttleKey = `${evt.session}:${evt.title}`;
  const now = Date.now();
  if (now - (lastSent.get(throttleKey) ?? 0) < THROTTLE_MS) return;
  lastSent.set(throttleKey, now);

  await sendPush(evt.title, evt.message, evt.session, evt.badge);
}
