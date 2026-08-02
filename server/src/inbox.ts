import { diffStatFor, type DiffStat } from "./git.js";
import { questionBroker } from "./questions.js";
import { registry } from "./registry.js";
import { listSessions } from "./tmux.js";
import { readConversation, resolveTranscriptPath, type ConvQuestion } from "./transcript.js";

// One decision waiting on the human, with enough context attached to make it
// without opening the session: what was asked, what the agent was in the middle
// of, and what it last said. Supervising a fleet is mostly draining this queue,
// so it's assembled server-side and served as one list.
export interface InboxItem {
  session: string;
  detail?: string; // the ask, verbatim from the Notification hook
  waitingSince: number; // ms epoch — when the session entered needs_input
  cwd?: string;
  muted?: boolean;
  // The tool call that has no result yet: what the agent is asking to do.
  pendingTool?: { tool?: string; verb?: string; arg?: string };
  question?: ConvQuestion; // an AskUserQuestion still awaiting an answer
  questionRequestId?: string;
  assistantText?: string; // its last words before stopping to ask
  diffStat?: DiffStat | null;
}

const MAX_ASSISTANT_TEXT = 700;

export async function buildInbox(): Promise<InboxItem[]> {
  const sessions = await listSessions();
  const items: InboxItem[] = [];

  for (const session of sessions) {
    const entry = registry.view(session.name);
    if (entry?.state !== "needs_input") continue;

    const item: InboxItem = {
      session: session.name,
      detail: entry.detail,
      waitingSince: entry.updatedAt,
      cwd: entry.cwd ?? session.panePath,
      muted: entry.notificationsMuted === true,
    };

    const activeQuestion = questionBroker.view(session.name);
    if (activeQuestion) {
      item.question = activeQuestion.questions[0];
      item.questionRequestId = activeQuestion.requestId;
      item.pendingTool = { tool: "AskUserQuestion", verb: "Question" };
    }

    const path = entry.transcriptPath ?? resolveTranscriptPath(entry.cwd, entry.claudeSessionId);
    // A short window: the decision context is always the tail of the turn.
    const conversation = readConversation(path, 30);
    if (conversation.available) {
      for (const conv of conversation.entries) {
        if (conv.kind === "assistant" && conv.text) item.assistantText = clip(conv.text);
        if (conv.kind !== "tool") continue;
        // No status means no tool_result yet — this is what it's blocked on.
        if (conv.status == null && !activeQuestion) {
          item.pendingTool = { tool: conv.tool, verb: conv.verb, arg: conv.arg };
          if (conv.questions?.length) item.question = conv.questions[0];
        }
      }
    }

    item.diffStat = await diffStatFor(item.cwd);
    items.push(item);
  }

  // Longest wait first: the queue should hand you the most-stalled agent, not
  // whichever one tmux happened to list first.
  return items.sort((a, b) => a.waitingSince - b.waitingSince);
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_ASSISTANT_TEXT ? trimmed.slice(0, MAX_ASSISTANT_TEXT) + "…" : trimmed;
}
