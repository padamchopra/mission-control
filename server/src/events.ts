import { registry } from "./registry.js";
import { listSessions } from "./tmux.js";
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
      await notify(session, `${session} needs input`, message);
      break;
    }
    case "Stop":
      registry.update(session, { ...base, state: "idle", detail: "turn finished" });
      await notify(session, `${session} finished its turn`, "");
      break;
    default:
      registry.update(session, base);
  }
}

async function notify(session: string, title: string, message: string): Promise<void> {
  await sendNotification({ session, title, message, badge: await needsInputCount() });
}

// Badge = live sessions currently waiting on the human.
async function needsInputCount(): Promise<number> {
  try {
    const sessions = await listSessions();
    return sessions.filter((s) => registry.view(s.name)?.state === "needs_input").length;
  } catch {
    return 0;
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
