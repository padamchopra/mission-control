import { registry } from "./registry.js";
import { capturePane } from "./tmux.js";
import { sendNotification } from "./notify.js";

export async function handleHookEvent(
  session: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const base = {
    claudeSessionId: str(payload.session_id),
    transcriptPath: str(payload.transcript_path),
    cwd: str(payload.cwd),
  };

  switch (event) {
    case "SessionStart":
      registry.update(session, { ...base, state: "working", detail: "session started" });
      break;
    case "UserPromptSubmit":
      registry.update(session, { ...base, state: "working", detail: undefined });
      break;
    case "Notification": {
      const message = str(payload.message) ?? "needs your input";
      registry.update(session, { ...base, state: "needs_input", detail: message });
      await notifyWithSnapshot(session, `🔶 ${session} needs input`, message);
      break;
    }
    case "Stop":
      registry.update(session, { ...base, state: "idle", detail: "turn finished" });
      await notifyWithSnapshot(session, `✅ ${session} finished its turn`, "");
      break;
    default:
      registry.update(session, base);
  }
}

async function notifyWithSnapshot(session: string, title: string, message: string): Promise<void> {
  let tail = "";
  try {
    const text = await capturePane(session, 60);
    tail = text.split("\n").slice(-12).join("\n");
  } catch {
    // session pane may already be gone
  }
  await sendNotification({ session, title, message, tail });
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
