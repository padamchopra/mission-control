import { registry } from "./registry.js";
import { sendNotification } from "./notify.js";

export async function handleHookEvent(
  session: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const previous = registry.view(session);
  const base = {
    claudeSessionId: str(payload.session_id),
    transcriptPath: str(payload.transcript_path),
    cwd: str(payload.cwd),
  };

  switch (event) {
    case "SessionStart":
      registry.update(session, { ...base, state: "working", detail: "session started" });
      registry.recordActivity(session, "Session started", "Claude session started");
      break;
    case "UserPromptSubmit":
      registry.update(session, { ...base, state: "working", detail: undefined });
      registry.recordActivity(session, "Prompt submitted", "Claude is working");
      break;
    case "Notification": {
      const message = str(payload.message) ?? "";
      // Claude exposes the reason for a Notification hook. In particular,
      // `idle_prompt` means a finished turn waiting for the next task — it is
      // not an approval/question. Only prompts that need a human decision get
      // the high-priority needs-input state.
      switch (str(payload.notification_type)) {
        case "permission_prompt":
        case "elicitation_dialog": {
          const detail = message || "needs your input";
          registry.update(session, { ...base, state: "needs_input", detail });
          const repeated = previous?.state === "needs_input" && previous.detail === detail;
          if (!repeated) {
            registry.recordActivity(session, "Needs input", detail);
            if (!previous?.notificationsMuted) {
              await sendNotification({ session, title: `${session} needs input`, message: detail, highPriority: true });
            }
          }
          break;
        }
        case "idle_prompt":
          registry.update(session, { ...base, state: "idle", detail: "waiting for your next prompt" });
          if (previous?.state !== "idle") {
            registry.recordActivity(session, "Idle", "Claude is waiting for the next prompt");
          }
          break;
        default:
          // Authentication and completed elicitation notifications do not say
          // anything about whether the agent needs attention. Keep its state.
          registry.update(session, base);
      }
      break;
    }
    case "Stop":
      registry.update(session, { ...base, state: "idle", detail: "turn finished" });
      // A Stop hook is likewise sometimes repeated. A completed turn merits
      // one quiet update, never a stack of identical banners.
      if (previous?.state !== "idle") {
        registry.recordActivity(session, "Turn finished", "Claude finished its turn");
        if (!previous?.notificationsMuted) {
          await sendNotification({ session, title: `${session} finished its turn`, message: "", highPriority: false });
        }
      }
      break;
    default:
      registry.update(session, base);
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
