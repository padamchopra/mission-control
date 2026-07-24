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
      registry.update(session, { ...base, state: "working", detail: "session started", currentAction: undefined });
      registry.recordActivity(session, "Session started", "Claude session started");
      break;
    case "UserPromptSubmit":
      registry.update(session, { ...base, state: "working", detail: undefined, currentAction: undefined });
      registry.recordActivity(session, "Prompt submitted", "Claude is working");
      break;
    // PreToolUse/PostToolUse give the fleet a live "what it's doing now" label.
    // They fire often, so they only patch state — never the activity log.
    case "PreToolUse":
      registry.update(session, { ...base, state: "working", currentAction: toolLabel(payload) });
      break;
    case "PostToolUse":
      registry.update(session, base);
      break;
    case "SessionEnd":
      registry.update(session, { ...base, state: "idle", detail: "session ended", currentAction: undefined });
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
          registry.update(session, { ...base, state: "idle", detail: "waiting for your next prompt", currentAction: undefined });
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
      registry.update(session, { ...base, state: "idle", detail: "turn finished", currentAction: undefined });
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

// A short, human label for what a tool call is doing, shown live on fleet cards.
function toolLabel(payload: Record<string, unknown>): string | undefined {
  const name = str(payload.tool_name);
  if (!name) return undefined;
  const input = payload.tool_input && typeof payload.tool_input === "object" ? (payload.tool_input as Record<string, unknown>) : {};
  const base = (value: unknown) => {
    const s = str(value);
    return s ? s.split("/").pop() || s : "";
  };
  switch (name) {
    case "Read":
      return `Reading ${base(input.file_path)}`;
    case "Edit":
    case "MultiEdit":
      return `Editing ${base(input.file_path)}`;
    case "Write":
      return `Writing ${base(input.file_path)}`;
    case "Bash": {
      const command = str(input.command) ?? str(input.description);
      return command ? `Running: ${command.slice(0, 44)}` : "Running a command";
    }
    case "Grep":
    case "Glob":
      return "Searching the code";
    case "Task":
    case "Agent":
      return "Delegating to a subagent";
    case "TodoWrite":
      return "Updating the plan";
    case "WebFetch":
    case "WebSearch":
      return "Searching the web";
    default:
      return name;
  }
}
