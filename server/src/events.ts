import { agentKind, type AgentKind } from "./agent.js";
import { registry } from "./registry.js";
import { pushSession, pushSessionList, sendNotification } from "./notify.js";

export async function handleHookEvent(
  session: string,
  event: string,
  payload: Record<string, unknown>,
  reportedAgent?: AgentKind,
): Promise<void> {
  const previous = registry.view(session);
  const agent = agentKind(reportedAgent, previous?.agent ?? "claude");
  const agentName = agent === "codex" ? "Codex" : agent === "claude" ? "Claude" : "Agent";
  const sessionId = str(payload.session_id);
  const base = {
    agent,
    agentSessionId: sessionId,
    claudeSessionId: agent === "claude" ? sessionId : undefined,
    transcriptPath: str(payload.transcript_path),
    cwd: str(payload.cwd),
  };

  switch (event) {
    case "SessionStart":
      registry.update(session, { ...base, state: "working", detail: "session started", currentAction: undefined });
      registry.recordActivity(session, "Session started", `${agentName} session started`);
      break;
    case "UserPromptSubmit":
      registry.update(session, { ...base, state: "working", detail: undefined, currentAction: undefined });
      registry.recordActivity(session, "Prompt submitted", `${agentName} is working`);
      break;
    // PreToolUse/PostToolUse give the fleet a live "what it's doing now" label.
    // They fire often, so they only patch state — never the activity log.
    case "PreToolUse": {
      // AskUserQuestion is unusual: the tool itself is an interactive dialog,
      // so it has not "started working" when PreToolUse fires — it is about to
      // block on the human. Mark it here instead of relying solely on the later
      // elicitation_dialog notification, which can be missing for sessions that
      // started before hooks were installed or trusted.
      if (str(payload.tool_name) === "AskUserQuestion") {
        const detail = questionDetail(payload);
        registry.update(session, {
          ...base,
          state: "needs_input",
          detail,
          currentAction: undefined,
          interactionKind: "ask_user_question",
          interactionRequestId: str(payload.tool_use_id),
        });
        if (previous?.state !== "needs_input") {
          registry.recordActivity(session, "Needs input", detail);
          if (!previous?.notificationsMuted) {
            await sendNotification({ session, title: `${session} needs input`, message: detail, highPriority: true });
          }
        }
      } else {
        registry.update(session, {
          ...base,
          state: "working",
          detail: undefined,
          currentAction: toolLabel(payload),
          interactionKind: undefined,
          interactionRequestId: undefined,
        });
      }
      break;
    }
    case "PostToolUse":
      // Once an interactive tool has a result the agent is processing again.
      // Explicitly leave needs_input so an answered dialog cannot linger in the
      // fleet until the eventual Stop event. Leave other tool state transitions
      // unchanged because parallel tool completions must not dismiss a separate
      // permission prompt that is still open.
      registry.update(session, str(payload.tool_name) === "AskUserQuestion"
        ? {
            ...base,
            state: "working",
            detail: undefined,
            currentAction: undefined,
            interactionKind: undefined,
            interactionRequestId: undefined,
          }
        : { ...base, currentAction: undefined });
      break;
    case "SessionEnd":
      registry.update(session, {
        ...base,
        state: "idle",
        detail: "session ended",
        currentAction: undefined,
        interactionKind: undefined,
        interactionRequestId: undefined,
      });
      break;
    case "PermissionRequest": {
      const detail = approvalDetail(payload);
      registry.update(session, { ...base, state: "needs_input", detail, currentAction: undefined });
      const repeated = previous?.state === "needs_input" && previous.detail === detail;
      if (!repeated) {
        registry.recordActivity(session, "Needs input", detail);
        if (!previous?.notificationsMuted) {
          await sendNotification({ session, title: `${session} needs input`, message: detail, highPriority: true });
        }
      }
      break;
    }
    case "Notification": {
      const message = str(payload.message) ?? "";
      // Claude exposes the reason for a Notification hook. In particular,
      // `idle_prompt` means a finished turn waiting for the next task — it is
      // not an approval/question. Only prompts that need a human decision get
      // the high-priority needs-input state.
      switch (str(payload.notification_type)) {
        case "permission_prompt":
        case "elicitation_dialog": {
          // PreToolUse(AskUserQuestion) carries the actual question, which is
          // more useful than Claude's generic elicitation notification. Keep it
          // and suppress the second banner when both hooks fire as expected.
          const repeated = previous?.state === "needs_input";
          const detail = repeated && previous?.detail ? previous.detail : message || "needs your input";
          registry.update(session, { ...base, state: "needs_input", detail });
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
            registry.recordActivity(session, "Idle", `${agentName} is waiting for the next prompt`);
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
      registry.update(session, {
        ...base,
        state: "idle",
        detail: "turn finished",
        currentAction: undefined,
        interactionKind: undefined,
        interactionRequestId: undefined,
      });
      // A Stop hook is likewise sometimes repeated. A completed turn merits
      // one quiet update, never a stack of identical banners.
      if (previous?.state !== "idle") {
        registry.recordActivity(session, "Turn finished", `${agentName} finished its turn`);
        if (!previous?.notificationsMuted) {
          await sendNotification({ session, title: `${session} finished its turn`, message: "", highPriority: false });
        }
      }
      break;
    default:
      registry.update(session, base);
  }

  // Every hook event moves the session's state, its live action label, or the
  // transcript — push it so open clients repaint immediately instead of
  // waiting out a poll. A session starting or ending can also add a row the
  // fleet list has never seen, which only a refetch can fill in.
  if (event === "SessionStart" || event === "SessionEnd") pushSessionList();
  pushSession(session, registry.view(session));
}

function approvalDetail(payload: Record<string, unknown>): string {
  const input = payload.tool_input && typeof payload.tool_input === "object"
    ? payload.tool_input as Record<string, unknown>
    : {};
  return str(input.description)
    ?? (str(payload.tool_name) ? `${str(payload.tool_name)} needs approval` : undefined)
    ?? "needs your approval";
}

function questionDetail(payload: Record<string, unknown>): string {
  const input = payload.tool_input && typeof payload.tool_input === "object"
    ? payload.tool_input as Record<string, unknown>
    : {};
  const questions = Array.isArray(input.questions) ? input.questions : [];
  const first = questions[0] && typeof questions[0] === "object"
    ? questions[0] as Record<string, unknown>
    : {};
  return str(first.question) ?? "Claude has a question";
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
    case "apply_patch":
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
    case "update_plan":
      return "Updating the plan";
    case "WebFetch":
    case "WebSearch":
      return "Searching the web";
    default:
      return name;
  }
}
