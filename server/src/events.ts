import { registry } from "./registry.js";
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
      await sendNotification({ session, title: `${session} needs input`, message, highPriority: true });
      break;
    }
    case "Stop":
      registry.update(session, { ...base, state: "idle", detail: "turn finished" });
      await sendNotification({ session, title: `${session} finished its turn`, message: "", highPriority: false });
      break;
    default:
      registry.update(session, base);
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
