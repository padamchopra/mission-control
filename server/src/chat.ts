import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";
import {
  query,
  type Options,
  type PermissionMode,
  type PermissionResult,
  type PermissionUpdate,
  type Query,
  type SDKMessage,
  type SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { agentCommand } from "./agent.js";
import {
  assertChatStorage,
  chatStorageError,
  deleteEntries,
  loadChats,
  removeChat,
  saveChat,
  saveEntry,
  trimEntries,
} from "./chat-storage.js";
import { config } from "./config.js";
import { suggestName } from "./namer.js";
import { broadcast, sendNotification } from "./notify.js";
import { syncSleepAssertion } from "./sleep.js";
import {
  applyAnswers,
  applyNotes,
  buildDiff,
  buildQuestions,
  clip,
  countDiff,
  describeTool,
  extractTodos,
  resultText,
  MAX_OUTPUT,
  MAX_TEXT,
  MAX_THINK,
  type ContextUsage,
  type ConvDiffLine,
  type ConvEntry,
  type ConvQuestion,
  type ConvTodo,
} from "./transcript.js";
import { uploadRoot } from "./uploads.js";
import { nameDetachedWorktree } from "./workspaces.js";

// Chats are conversations Remy owns end to end: the server runs
// Claude through the Agent SDK, keeps the transcript itself, and streams it to
// every connected client. Unlike a tmux session there is no terminal behind
// this — the feed *is* the session, so approvals and questions have to be
// answered here rather than by driving a cursor.

export type ChatState = "idle" | "working" | "needs_input" | "error";
export type ChatPermissionMode =
  | "default"
  | "auto"
  | "acceptEdits"
  | "plan"
  | "bypassPermissions";

const PERMISSION_MODES: ChatPermissionMode[] = [
  "default",
  "auto",
  "acceptEdits",
  "plan",
  "bypassPermissions",
];

/// A tool call Claude is blocked on. Mirrors the shape of a tool entry so the
/// client can render the pending card with the same vocabulary as the feed.
export interface ChatApproval {
  requestId: string;
  tool: string;
  verb: string;
  arg: string;
  /// The prompt sentence the CLI itself would have shown, when it supplies one.
  title?: string;
  reason?: string;
  file?: string;
  diff?: ConvDiffLine[];
  /// ExitPlanMode's proposed plan, so the card can show what is being approved.
  plan?: string;
  /// Whether "always allow" is on offer — it isn't for one-off shapes like a
  /// plan hand-off, where a blanket rule would mean nothing.
  allowAlways: boolean;
  at: number;
}

export interface ChatQuestionRequest {
  requestId: string;
  questions: ConvQuestion[];
}

/// What survives a server restart, held in SQLite (see chat-storage.ts). The
/// live query, its pending approvals, and the streaming block cursors are all
/// runtime-only: a restart resumes the Claude session by id and starts a fresh
/// process.
interface ChatRecord {
  id: string;
  title: string;
  cwd: string;
  model?: string;
  permissionMode: ChatPermissionMode;
  createdAt: number;
  updatedAt: number;
  claudeSessionId?: string;
  entries: ConvEntry[];
  todos: ConvTodo[];
  context?: ContextUsage;
  turns: number;
  costUsd?: number;
  error?: string;
}

export interface ChatSummary {
  id: string;
  title: string;
  cwd: string;
  model?: string;
  permissionMode: ChatPermissionMode;
  createdAt: number;
  updatedAt: number;
  state: ChatState;
  action?: string;
  preview?: string;
  /// When the chat started the run it is in, if it is in one. Absent once it
  /// settles, so a client never shows a clock for a chat that is done.
  workingSince?: number;
  context?: ContextUsage;
  turns: number;
  costUsd?: number;
  error?: string;
  /// True while a chat is holding a live Claude process, so the client can say
  /// which chats are warm and which will resume on the next message.
  live: boolean;
}

export interface ChatDetail extends ChatSummary {
  entries: ConvEntry[];
  todos: ConvTodo[];
  approval?: ChatApproval;
  question?: ChatQuestionRequest;
}

// The feed a client renders. Older turns stay in Claude's own transcript; this
// is the window Remy keeps.
const MAX_ENTRIES = 500;
// A chat with no live turn drops its Claude process after this, and resumes by
// session id on the next message. Long-lived chats would otherwise pin one
// `claude` process each for as long as the host is up.
const IDLE_SHUTDOWN_MS = 15 * 60_000;
// Text arrives token by token; repainting every client on every token would
// spend the whole tailnet budget on one paragraph.
const STREAM_FLUSH_MS = 120;

function nowMs(): number {
  return Date.now();
}

function titleFrom(text: string): string {
  const line = text.trim().split("\n").find((l) => l.trim()) ?? text.trim();
  return clip(line, 60) || "New chat";
}

export function permissionMode(value: unknown, fallback: ChatPermissionMode = "default"): ChatPermissionMode {
  return PERMISSION_MODES.includes(value as ChatPermissionMode) ? (value as ChatPermissionMode) : fallback;
}

/// launchd hands the server a stripped PATH. Claude's own Bash tool inherits it,
/// so without this a chat would fail on `git`, `gh`, or `node` while the same
/// command works in a tmux session started from a login shell.
function agentEnvironment(): NodeJS.ProcessEnv {
  const extra = ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local", "bin"), "/usr/bin", "/bin", "/usr/sbin", "/sbin"];
  const current = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const merged = [...new Set([...current, ...extra])].join(delimiter);
  return { ...process.env, PATH: merged };
}

/// The SDK takes the prompt as an async iterable, which is what keeps one Claude
/// session alive across turns: each message is pushed in as the user sends it
/// rather than the process being restarted per turn.
class PromptQueue implements AsyncIterable<SDKUserMessage> {
  private queued: SDKUserMessage[] = [];
  private waiting: ((result: IteratorResult<SDKUserMessage>) => void)[] = [];
  private closed = false;

  push(message: SDKUserMessage): void {
    if (this.closed) return;
    const waiter = this.waiting.shift();
    if (waiter) waiter({ value: message, done: false });
    else this.queued.push(message);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiting.splice(0)) waiter({ value: undefined as never, done: true });
  }

  [Symbol.asyncIterator](): AsyncIterator<SDKUserMessage> {
    return {
      next: () =>
        new Promise<IteratorResult<SDKUserMessage>>((resolve) => {
          const queued = this.queued.shift();
          if (queued) return resolve({ value: queued, done: false });
          if (this.closed) return resolve({ value: undefined as never, done: true });
          this.waiting.push(resolve);
        }),
      return: async () => {
        this.close();
        return { value: undefined as never, done: true };
      },
    };
  }
}

function userMessage(text: string): SDKUserMessage {
  return {
    type: "user",
    message: { role: "user", content: [{ type: "text", text }] },
    parent_tool_use_id: null,
    session_id: "",
  } as SDKUserMessage;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

class Chat {
  record: ChatRecord;
  private currentState: ChatState = "idle";
  /// When the current run of work began, so a client can say how long a chat
  /// has been at it. A turn that stops to ask you something is still the same
  /// run, so this survives `needs_input` and clears only when the chat settles.
  workingSince?: number;
  action?: string;
  approval?: ChatApproval;
  question?: ChatQuestionRequest;

  private live?: { query: Query; queue: PromptQueue };
  private pending = new Map<string, (result: PermissionResult) => void>();
  private byToolUseId = new Map<string, ConvEntry>();
  private byId = new Map<string, ConvEntry>();
  // Blocks the CLI is still streaming, keyed message id + block index.
  private openBlocks = new Map<string, ConvEntry>();
  private streamedMessages = new Set<string>();
  private currentMessageId?: string;
  private flushTimer?: NodeJS.Timeout;
  private dirtyEntries = new Set<string>();
  private lastActivity = nowMs();
  private lastPersist = 0;
  private deleted = false;
  private peakTokens = 0;
  private compactions = 0;
  // The exact `questions` array Claude sent, echoed back with the answers.
  private lastQuestionInput: unknown[] = [];

  constructor(record: ChatRecord) {
    this.record = record;
    for (const entry of record.entries) this.byId.set(entry.id, entry);
  }

  get id(): string {
    return this.record.id;
  }

  get isLive(): boolean {
    return this.live !== undefined;
  }

  get state(): ChatState {
    return this.currentState;
  }

  /// Every transition runs through here so the "how long" clock is kept by the
  /// one place that knows a run started, rather than by each of the dozen
  /// callers that move the state.
  set state(next: ChatState) {
    if (next === this.currentState) return;
    const busy = next === "working" || next === "needs_input";
    this.workingSince = busy ? (this.workingSince ?? nowMs()) : undefined;
    this.currentState = next;
  }

  summary(): ChatSummary {
    const lastText = [...this.record.entries]
      .reverse()
      .find((e) => (e.kind === "assistant" || e.kind === "user") && e.text?.trim());
    return {
      id: this.record.id,
      title: this.record.title,
      cwd: this.record.cwd,
      model: this.record.model,
      permissionMode: this.record.permissionMode,
      createdAt: this.record.createdAt,
      updatedAt: this.record.updatedAt,
      state: this.state,
      action: this.action,
      preview: lastText?.text ? clip(lastText.text, 140) : undefined,
      workingSince: this.workingSince,
      context: this.record.context,
      turns: this.record.turns,
      costUsd: this.record.costUsd,
      error: this.record.error,
      live: this.isLive,
    };
  }

  detail(): ChatDetail {
    return {
      ...this.summary(),
      entries: this.record.entries,
      todos: this.record.todos,
      approval: this.approval,
      question: this.question,
    };
  }

  // ── sending ──────────────────────────────────────────────────────────────

  async send(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const first = this.record.entries.length === 0;
    if (first && this.record.title === "New chat") {
      this.record.title = titleFrom(trimmed);
    }
    // A better name is worth having but not worth waiting for, so it runs
    // alongside the turn and lands whenever it lands.
    if (first) void this.rename(trimmed);
    this.append({ id: `u-${randomUUID()}`, kind: "user", text: clip(trimmed, MAX_TEXT) });
    this.record.error = undefined;
    // A prompt typed while Claude is blocked on a permission is queued behind
    // it, so the chat is still waiting on the human, not working.
    this.state = this.pending.size > 0 ? "needs_input" : "working";
    this.action = undefined;
    this.lastActivity = nowMs();
    const session = await this.start();
    session.queue.push(userMessage(trimmed));
    this.push();
    this.persist();
  }

  /// Interrupts the running turn. Anything Claude is blocked on is denied first —
  /// a permission request that outlives its turn would block the next one.
  async interrupt(): Promise<void> {
    this.settlePending("User stopped the turn.");
    const live = this.live;
    if (!live) {
      this.state = "idle";
      this.push();
      return;
    }
    try {
      await live.query.interrupt();
    } catch {
      // The CLI may have already finished; the pump will settle the state.
    }
    this.state = "idle";
    this.action = undefined;
    this.push();
  }

  respondApproval(requestId: string, decision: "allow" | "allowAlways" | "deny"): void {
    // `settle` owns removing the request — deleting it here first would make it
    // a no-op and leave Claude parked on a permission it thinks is unanswered.
    const settle = this.pending.get(requestId);
    if (!settle) throw new Error("that request is no longer waiting");
    const approval = this.approval?.requestId === requestId ? this.approval : undefined;
    this.state = "working";
    if (decision === "deny") {
      settle({ behavior: "deny", message: "The user denied this tool call." });
    } else {
      settle({
        behavior: "allow",
        ...(decision === "allowAlways" && approval
          ? { updatedPermissions: sessionAllowRules(approval.tool) }
          : {}),
      });
      if (approval?.tool === "ExitPlanMode" && this.record.permissionMode === "plan") {
        this.record.permissionMode = "default";
        this.persist();
      }
    }
    this.push();
  }

  respondQuestion(requestId: string, answers: Record<string, unknown>): void {
    const settle = this.pending.get(requestId);
    if (!settle) throw new Error("that question is no longer waiting");
    this.state = "working";
    // Claude looks answers up by the exact question text, so the client echoes
    // the question strings back rather than an index.
    settle({ behavior: "allow", updatedInput: { questions: this.lastQuestionInput, answers } });
    this.push();
  }

  /// Ends the Claude process but keeps the chat: the next message resumes the
  /// same conversation through its recorded session id.
  stop(): void {
    this.settlePending("Session stopped.");
    const live = this.live;
    // Closing the prompt stream only ends the session once the current turn
    // finishes, so interrupt first when one is running.
    if (live && this.state === "working") {
      live.query.interrupt().catch(() => {});
    }
    live?.queue.close();
    this.live = undefined;
    this.openBlocks.clear();
    if (this.state === "working") this.state = "idle";
    this.push();
  }

  maybeReap(): void {
    if (!this.live || this.state !== "idle") return;
    if (nowMs() - this.lastActivity < IDLE_SHUTDOWN_MS) return;
    this.stop();
  }

  /// Replaces the first-line title with one the naming model wrote, and puts a
  /// branch on the worktree if this thread is running in one Remy left
  /// detached. Only ever touches a title nobody has changed in the meantime —
  /// yours wins.
  private async rename(request: string): Promise<void> {
    const before = this.record.title;
    const suggested = await suggestName(request, config.remyModel);
    if (!suggested || this.deleted) return;

    // The branch is claimed even when the title has since been changed by hand:
    // one is about the work, the other is about the list.
    let branched = false;
    if (suggested.branch) {
      const prefix = config.worktreeBranchPrefix;
      branched = await nameDetachedWorktree(
        this.record.cwd,
        prefix ? `${prefix}/${suggested.branch}` : suggested.branch,
      );
    }

    const renamed = this.record.title === before && suggested.title !== before;
    if (renamed) {
      this.record.title = suggested.title;
      this.record.updatedAt = nowMs();
      this.persist();
    }
    if (!renamed && !branched) return;
    // stateFields carries the title, so an open thread renames itself without
    // refetching; `chats` is what makes a client re-read the worktrees.
    this.push();
    broadcast({ type: "chats" });
  }

  // ── the SDK session ──────────────────────────────────────────────────────

  private async start(): Promise<{ query: Query; queue: PromptQueue }> {
    if (this.live) return this.live;
    const queue = new PromptQueue();
    const options: Options = {
      cwd: this.record.cwd,
      pathToClaudeCodeExecutable: agentCommand("claude"),
      systemPrompt: { type: "preset", preset: "claude_code" },
      // The user's own Claude Code configuration — settings, permissions,
      // CLAUDE.md, skills — so a chat behaves like their terminal sessions.
      settingSources: ["user", "project", "local"],
      permissionMode: this.record.permissionMode as PermissionMode,
      ...(this.record.permissionMode === "bypassPermissions"
        ? { allowDangerouslySkipPermissions: true }
        : {}),
      ...(this.record.model ? { model: this.record.model } : {}),
      ...(this.record.claudeSessionId ? { resume: this.record.claudeSessionId } : {}),
      includePartialMessages: true,
      canUseTool: (tool, input, callbackOptions) => this.canUseTool(tool, input, callbackOptions),
      env: agentEnvironment(),
      // Uploaded media is referenced by path in the message that carries it;
      // granting the upload directory keeps reading it from prompting.
      additionalDirectories: [uploadRoot],
      stderr: (data) => {
        const text = data.trim();
        if (text) console.error(`chat ${this.record.id}: ${text}`);
      },
    };
    const handle = query({ prompt: queue, options });
    const live = { query: handle, queue };
    this.live = live;
    // Fire-and-forget, but never silently: this promise is the whole turn.
    this.pump(live).catch((error) => console.error(`chat ${this.record.id} pump failed:`, error));
    return live;
  }

  private async pump(live: { query: Query; queue: PromptQueue }): Promise<void> {
    try {
      for await (const message of live.query) {
        try {
          this.handle(message);
        } catch (error) {
          console.error("chat message handling failed:", error);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.record.error = message;
      this.state = "error";
      this.append({ id: `e-${randomUUID()}`, kind: "assistant", text: `⚠️ ${clip(message, 400)}` });
      await sendNotification({
        session: this.record.id,
        click: `remy://chat/${this.record.id}`,
        title: `${this.record.title} failed`,
        message: clip(message, 200),
        highPriority: true,
      });
    } finally {
      if (this.live === live) this.live = undefined;
      this.settlePending("The Claude session ended.");
      this.openBlocks.clear();
      if (this.state === "working") this.state = "idle";
      this.flush();
      this.push();
      this.persist();
    }
  }

  private handle(message: SDKMessage): void {
    this.lastActivity = nowMs();
    switch (message.type) {
      case "system":
        this.handleSystem(message as Record<string, unknown>);
        break;
      case "stream_event":
        this.handleStreamEvent(message as Record<string, unknown>);
        break;
      case "assistant":
        this.handleAssistant(message as Record<string, unknown>);
        break;
      case "user":
        this.handleToolResults(message as Record<string, unknown>);
        break;
      case "result":
        this.handleResult(message as Record<string, unknown>);
        break;
      default:
        break;
    }
  }

  private handleSystem(message: Record<string, unknown>): void {
    if (message.subtype === "init") {
      // The session id is what a later resume hangs off, so record it before
      // anything else can fail.
      const sessionId = str(message.session_id);
      if (sessionId && sessionId !== this.record.claudeSessionId) {
        this.record.claudeSessionId = sessionId;
        this.persist();
      }
      return;
    }
    if (message.subtype === "compact_boundary") {
      this.compactions += 1;
      this.append({
        id: `c-${randomUUID()}`,
        kind: "assistant",
        text: "— context compacted —",
      });
    }
  }

  private handleStreamEvent(message: Record<string, unknown>): void {
    const event = message.event as Record<string, any> | undefined;
    if (!event) return;
    switch (event.type) {
      case "message_start":
        this.currentMessageId = str(event.message?.id);
        break;
      case "content_block_start": {
        const kind = blockKind(event.content_block?.type);
        if (!kind || !this.currentMessageId) return;
        const id = `${this.currentMessageId}#${event.index}`;
        this.streamedMessages.add(this.currentMessageId);
        // Materialised on the first delta, so an empty bubble never flashes.
        this.openBlocks.set(id, { id, kind, text: "" });
        break;
      }
      case "content_block_delta": {
        if (!this.currentMessageId) return;
        const id = `${this.currentMessageId}#${event.index}`;
        const entry = this.openBlocks.get(id);
        if (!entry) return;
        const delta = event.delta as Record<string, unknown> | undefined;
        const chunk =
          delta?.type === "text_delta"
            ? str(delta.text)
            : delta?.type === "thinking_delta"
              ? str(delta.thinking)
              : undefined;
        if (!chunk) return;
        entry.text = (entry.text ?? "") + chunk;
        if (!this.byId.has(entry.id)) this.append(entry, { defer: true });
        this.markDirty(entry.id);
        break;
      }
      case "content_block_stop": {
        if (!this.currentMessageId) return;
        const id = `${this.currentMessageId}#${event.index}`;
        const entry = this.openBlocks.get(id);
        if (!entry) return;
        this.openBlocks.delete(id);
        entry.text = clip(entry.text ?? "", entry.kind === "thinking" ? MAX_THINK : MAX_TEXT);
        if (!entry.text) {
          this.remove(entry.id);
          return;
        }
        this.markDirty(entry.id);
        this.flush();
        break;
      }
      default:
        break;
    }
  }

  private handleAssistant(message: Record<string, unknown>): void {
    const payload = message.message as Record<string, any> | undefined;
    const content = Array.isArray(payload?.content) ? payload!.content : [];
    // Text and reasoning already arrived as deltas for a streamed message;
    // re-adding them here would double every paragraph.
    const streamed = typeof payload?.id === "string" && this.streamedMessages.has(payload.id);
    const usage = payload?.usage;
    if (usage) this.recordUsage(usage, str(payload?.model));

    for (const block of content) {
      if (block?.type === "text" || block?.type === "thinking") {
        if (streamed) continue;
        const text = block.type === "text" ? str(block.text) : str(block.thinking);
        if (!text?.trim()) continue;
        this.append({
          id: `${payload?.id ?? randomUUID()}-${this.record.entries.length}`,
          kind: block.type === "text" ? "assistant" : "thinking",
          text: clip(text, block.type === "text" ? MAX_TEXT : MAX_THINK),
        });
        continue;
      }
      if (block?.type !== "tool_use") continue;
      if (block.name === "TodoWrite") {
        const todos = extractTodos(block.input);
        if (todos.length) {
          this.record.todos = todos;
          this.push();
        }
        continue;
      }
      const described = describeTool(block.name, block.input);
      const entry: ConvEntry = {
        id: typeof block.id === "string" ? block.id : `t-${randomUUID()}`,
        kind: "tool",
        tool: block.name,
        verb: described.verb,
        arg: described.arg,
      };
      if (described.file) entry.file = described.file;
      if (described.skill) entry.skill = described.skill;
      const diff = buildDiff(block.name, block.input);
      if (diff.length) entry.diff = diff;
      const counts = countDiff(block.name, block.input);
      if (counts.adds || counts.dels) {
        entry.adds = counts.adds;
        entry.dels = counts.dels;
      }
      if (block.name === "AskUserQuestion") {
        const questions = buildQuestions(block.input);
        if (questions.length) entry.questions = questions;
      }
      this.byToolUseId.set(entry.id, entry);
      this.append(entry);
      this.action = `${described.verb} ${described.arg}`.trim();
      this.push();
    }
  }

  private handleToolResults(message: Record<string, unknown>): void {
    const payload = message.message as Record<string, any> | undefined;
    const content = payload?.content;
    if (!Array.isArray(content)) return;
    for (const block of content) {
      if (block?.type !== "tool_result") continue;
      const entry = this.byToolUseId.get(block.tool_use_id);
      if (!entry) continue;
      entry.status = block.is_error ? "error" : "ok";
      const toolUseResult = message.tool_use_result as Record<string, unknown> | undefined;
      if (entry.questions) {
        applyAnswers(entry.questions, toolUseResult?.answers);
        applyNotes(entry.questions, toolUseResult?.annotations);
      } else {
        const output = resultText(block.content) ?? resultText(toolUseResult);
        if (output) entry.output = clip(output, MAX_OUTPUT);
      }
      this.markDirty(entry.id);
    }
    this.flush();
  }

  private handleResult(message: Record<string, unknown>): void {
    const turns = num(message.num_turns);
    if (turns > 0) this.record.turns = turns;
    const cost = num(message.total_cost_usd);
    if (cost > 0) this.record.costUsd = cost;
    const failed = message.is_error === true || (typeof message.subtype === "string" && message.subtype !== "success");
    if (failed) {
      const detail = str(message.result) ?? str(message.subtype) ?? "the turn failed";
      // An interrupt is a result too; it isn't an error worth shouting about.
      if (!/abort|interrupt|cancel/i.test(detail)) {
        this.record.error = detail;
        this.append({ id: `r-${randomUUID()}`, kind: "assistant", text: `⚠️ ${clip(detail, 400)}` });
      }
    }
    this.state = this.pending.size > 0 ? "needs_input" : "idle";
    this.action = undefined;
    this.record.updatedAt = nowMs();
    this.flush();
    this.push();
    this.persist();
    this.notifyTurnEnd().catch(() => {});
  }

  private async notifyTurnEnd(): Promise<void> {
    const last = [...this.record.entries].reverse().find((e) => e.kind === "assistant" && e.text?.trim());
    await sendNotification({
      session: this.record.id,
      click: `remy://chat/${this.record.id}`,
      title: `${this.record.title} finished`,
      message: last?.text ? clip(last.text, 200) : "The turn is done.",
      highPriority: false,
    });
  }

  private recordUsage(usage: Record<string, unknown>, model?: string): void {
    const tokens = num(usage.input_tokens) + num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens);
    if (tokens <= 0) return;
    if (tokens > this.peakTokens) this.peakTokens = tokens;
    // A window bigger than the configured one proves the session is running a
    // long-context variant, the same inference the transcript meter makes.
    const limit = this.peakTokens > config.contextLimit ? 1_000_000 : config.contextLimit;
    this.record.context = {
      tokens,
      limit,
      limitEstimated: true,
      model: model ?? this.record.context?.model,
      compactions: this.compactions,
      droppedTokens: this.record.context?.droppedTokens ?? 0,
    };
  }

  // ── permissions ──────────────────────────────────────────────────────────

  private canUseTool(
    tool: string,
    input: Record<string, unknown>,
    options: { signal: AbortSignal; suggestions?: PermissionUpdate[]; title?: string; decisionReason?: string },
  ): Promise<PermissionResult> {
    if (tool === "AskUserQuestion") return this.askUserQuestion(input, options.signal);

    const requestId = randomUUID();
    const described = describeTool(tool, input);
    const diff = buildDiff(tool, input);
    const plan = tool === "ExitPlanMode" ? str((input as { plan?: unknown }).plan) : undefined;
    const approval: ChatApproval = {
      requestId,
      tool,
      verb: described.verb,
      arg: described.arg,
      ...(options.title ? { title: options.title } : {}),
      ...(options.decisionReason ? { reason: options.decisionReason } : {}),
      ...(described.file ? { file: described.file } : {}),
      ...(diff.length ? { diff } : {}),
      ...(plan ? { plan: clip(plan, 4000) } : {}),
      allowAlways: tool !== "ExitPlanMode",
      at: nowMs(),
    };
    this.approval = approval;
    this.state = "needs_input";
    this.push();
    void sendNotification({
      session: this.record.id,
      click: `remy://chat/${this.record.id}`,
      title: `${this.record.title} needs approval`,
      message: options.title ?? `${described.verb} ${described.arg}`.trim(),
      highPriority: true,
    });
    return this.park(requestId, options.signal, () => {
      if (this.approval?.requestId === requestId) this.approval = undefined;
    });
  }

  private askUserQuestion(input: Record<string, unknown>, signal: AbortSignal): Promise<PermissionResult> {
    const requestId = randomUUID();
    const questions = buildQuestions(input);
    this.lastQuestionInput = Array.isArray(input.questions) ? (input.questions as unknown[]) : [];
    this.question = { requestId, questions };
    this.state = "needs_input";
    this.push();
    void sendNotification({
      session: this.record.id,
      click: `remy://chat/${this.record.id}`,
      title: `${this.record.title} needs input`,
      message: questions[0]?.question ? clip(questions[0].question, 200) : "Claude asked you a question.",
      highPriority: true,
    });
    return this.park(requestId, signal, () => {
      if (this.question?.requestId === requestId) this.question = undefined;
    });
  }

  /// Blocks the SDK callback until a client answers, or until the turn it
  /// belongs to is torn down. Fail-closed: an abandoned request denies rather
  /// than leaving Claude parked forever.
  private park(
    requestId: string,
    signal: AbortSignal,
    cleanup: () => void,
  ): Promise<PermissionResult> {
    return new Promise<PermissionResult>((resolve) => {
      const settle = (result: PermissionResult) => {
        if (!this.pending.has(requestId)) return;
        this.pending.delete(requestId);
        cleanup();
        signal.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const onAbort = () => {
        settle({ behavior: "deny", message: "The turn was interrupted." });
        this.state = this.pending.size > 0 ? "needs_input" : "idle";
        this.push();
      };
      this.pending.set(requestId, settle);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  private settlePending(message: string): void {
    for (const settle of [...this.pending.values()]) {
      settle({ behavior: "deny", message });
    }
    this.pending.clear();
    this.approval = undefined;
    this.question = undefined;
  }

  // ── feed bookkeeping ─────────────────────────────────────────────────────

  private append(entry: ConvEntry, options: { defer?: boolean } = {}): void {
    this.record.entries.push(entry);
    this.byId.set(entry.id, entry);
    if (!this.deleted) saveEntry(this.record.id, entry);
    if (this.record.entries.length > MAX_ENTRIES) {
      const dropped = this.record.entries.splice(0, this.record.entries.length - MAX_ENTRIES);
      for (const old of dropped) this.byId.delete(old.id);
      if (!this.deleted) trimEntries(this.record.id, MAX_ENTRIES);
    }
    this.record.updatedAt = nowMs();
    this.markDirty(entry.id);
    if (!options.defer) this.flush();
  }

  private remove(id: string): void {
    const index = this.record.entries.findIndex((e) => e.id === id);
    if (index < 0) return;
    this.record.entries.splice(index, 1);
    this.byId.delete(id);
    this.dirtyEntries.delete(id);
    if (!this.deleted) deleteEntries(this.record.id, [id]);
    // Carries the scalar state too, so a client can always tell "cleared" from
    // "unchanged" by whether a push mentions state at all.
    broadcast({ type: "chat", chatId: this.record.id, removed: [id], ...this.stateFields() });
  }

  private markDirty(id: string): void {
    this.dirtyEntries.add(id);
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      this.flush();
    }, STREAM_FLUSH_MS);
    this.flushTimer.unref?.();
  }

  /// Send whatever changed since the last flush. Text deltas coalesce here, so
  /// a streaming paragraph costs a handful of messages rather than hundreds.
  private flush(): void {
    if (this.dirtyEntries.size === 0) return;
    const entries = [...this.dirtyEntries].map((id) => this.byId.get(id)).filter((e): e is ConvEntry => !!e);
    this.dirtyEntries.clear();
    if (entries.length === 0 || this.deleted) return;
    for (const entry of entries) saveEntry(this.record.id, entry);
    broadcast({ type: "chat", chatId: this.record.id, entries, ...this.stateFields() });
    // The feed is durable as it streams now, so this only keeps the chat row's
    // own columns — updatedAt, usage, the live action — roughly current.
    if (nowMs() - this.lastPersist > 5_000) this.persist();
  }

  /// The scalar state, always sent whole so a client never has to work out
  /// whether a missing field means "unchanged" or "cleared".
  private stateFields(): Record<string, unknown> {
    return {
      state: this.state,
      action: this.action ?? null,
      workingSince: this.workingSince ?? null,
      approval: this.approval ?? null,
      question: this.question ?? null,
      todos: this.record.todos,
      context: this.record.context ?? null,
      title: this.record.title,
      live: this.isLive,
      error: this.record.error ?? null,
      updatedAt: this.record.updatedAt,
    };
  }

  push(): void {
    if (this.deleted) return;
    broadcast({ type: "chat", chatId: this.record.id, ...this.stateFields() });
    syncSleepAssertion();
  }

  persist(): void {
    if (this.deleted) return;
    this.lastPersist = nowMs();
    saveChat(this.record);
  }

  /// Called once the chat is gone from the store. A turn already in flight keeps
  /// draining into a record nobody reads, but it must not write it back to disk
  /// or push it at clients that have dropped it.
  markDeleted(): void {
    this.deleted = true;
  }
}

function blockKind(type: unknown): ConvEntry["kind"] | undefined {
  if (type === "text") return "assistant";
  if (type === "thinking") return "thinking";
  return undefined;
}

function sessionAllowRules(tool: string): PermissionUpdate[] {
  return [{ type: "addRules", rules: [{ toolName: tool }], behavior: "allow", destination: "session" }];
}

// ── store ──────────────────────────────────────────────────────────────────

const chats = new Map<string, Chat>();

for (const stored of loadChats(MAX_ENTRIES)) {
  chats.set(stored.id, new Chat({ ...stored, permissionMode: permissionMode(stored.permissionMode) }));
}

/// Why chats cannot be used on this server, if they can't. Surfaced by the API
/// so the app explains itself instead of showing an empty list.
export function chatsUnavailable(): string | undefined {
  return chatStorageError();
}

export function listChats(): ChatSummary[] {
  return [...chats.values()].map((chat) => chat.summary()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getChat(id: string): ChatDetail | undefined {
  return chats.get(id)?.detail();
}

function expandChatCwd(raw: string): string {
  const trimmed = raw.trim() || "~";
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

export function createChat(input: {
  cwd: string;
  title?: string;
  model?: string;
  permissionMode?: unknown;
}): ChatSummary {
  // Refuse loudly rather than running a conversation this server cannot keep.
  assertChatStorage();
  const cwd = expandChatCwd(input.cwd);
  if (!existsSync(cwd)) throw new Error("that directory does not exist on this machine");
  // Fail here rather than on the first message, so a host without Claude Code
  // says so while the chat is still being created.
  agentCommand("claude");
  const record: ChatRecord = {
    id: randomUUID(),
    title: input.title?.trim() || "New chat",
    cwd,
    ...(input.model ? { model: input.model } : {}),
    permissionMode: permissionMode(input.permissionMode),
    createdAt: nowMs(),
    updatedAt: nowMs(),
    entries: [],
    todos: [],
    turns: 0,
  };
  const chat = new Chat(record);
  chats.set(record.id, chat);
  chat.persist();
  broadcast({ type: "chats" });
  return chat.summary();
}

export function updateChat(
  id: string,
  patch: { title?: string; model?: string | null; permissionMode?: unknown },
): ChatSummary {
  const chat = mustGet(id);
  if (typeof patch.title === "string" && patch.title.trim()) chat.record.title = clip(patch.title, 120);
  if (patch.model === null) chat.record.model = undefined;
  else if (typeof patch.model === "string" && patch.model.trim()) chat.record.model = patch.model.trim();
  if (patch.permissionMode !== undefined) {
    chat.record.permissionMode = permissionMode(patch.permissionMode, chat.record.permissionMode);
  }
  // Model and permission mode are start-up options for the Claude process, so
  // a running one is retired; the next message resumes with the new settings.
  if ((patch.model !== undefined || patch.permissionMode !== undefined) && chat.isLive) chat.stop();
  chat.record.updatedAt = nowMs();
  chat.persist();
  chat.push();
  broadcast({ type: "chats" });
  return chat.summary();
}

export async function sendChatMessage(id: string, text: string): Promise<void> {
  await mustGet(id).send(text);
}

export async function interruptChat(id: string): Promise<void> {
  await mustGet(id).interrupt();
}

export function respondToApproval(
  id: string,
  requestId: string,
  decision: "allow" | "allowAlways" | "deny",
): void {
  mustGet(id).respondApproval(requestId, decision);
}

export function respondToQuestion(id: string, requestId: string, answers: Record<string, unknown>): void {
  mustGet(id).respondQuestion(requestId, answers);
}

export function chatCwd(id: string): string {
  return mustGet(id).record.cwd;
}

export function deleteChat(id: string): void {
  const chat = mustGet(id);
  chat.stop();
  chat.markDeleted();
  chats.delete(id);
  removeChat(id);
  broadcast({ type: "chats" });
  syncSleepAssertion();
}

export function stopChat(id: string): void {
  mustGet(id).stop();
}

function mustGet(id: string): Chat {
  const chat = chats.get(id);
  if (!chat) throw new Error("no such chat");
  return chat;
}

setInterval(() => {
  for (const chat of chats.values()) chat.maybeReap();
}, 60_000).unref();
