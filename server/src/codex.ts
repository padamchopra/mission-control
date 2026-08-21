import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { codexSandbox } from "./providers.js";
import { clip, MAX_ARG, MAX_OUTPUT, MAX_TEXT, MAX_THINK, type ConvEntry, type ConvTodo } from "./transcript.js";

/// Threads that run on Codex.
///
/// `codex exec --experimental-json` takes a prompt on stdin, writes one JSON
/// event per line, and exits when the turn is done. So a Codex thread is a
/// process per turn rather than a session held open, and what carries the
/// conversation across turns is the thread id Codex gives back — `resume <id>`
/// picks up the transcript Codex keeps in `~/.codex/sessions`.
///
/// The events below are Codex's own, named as it names them. Nothing here talks
/// to the network: it is the copy of Codex on this machine, spawned with an
/// argument array like every other tool Remy reaches.

export type CodexItem =
  | { id: string; type: "agent_message"; text: string }
  | { id: string; type: "reasoning"; text: string }
  | {
      id: string;
      type: "command_execution";
      command: string;
      aggregated_output?: string;
      exit_code?: number;
      status: "in_progress" | "completed" | "failed";
    }
  | {
      id: string;
      type: "file_change";
      changes: { path: string; kind: "add" | "delete" | "update" }[];
      status: "completed" | "failed";
    }
  | {
      id: string;
      type: "mcp_tool_call";
      server: string;
      tool: string;
      arguments?: unknown;
      error?: { message: string };
      status: "in_progress" | "completed" | "failed";
    }
  | { id: string; type: "web_search"; query: string }
  | { id: string; type: "todo_list"; items: { text: string; completed: boolean }[] }
  | { id: string; type: "error"; message: string };

export interface CodexUsage {
  input_tokens: number;
  cached_input_tokens: number;
  cache_write_input_tokens?: number;
  output_tokens: number;
  reasoning_output_tokens?: number;
}

export type CodexEvent =
  | { type: "thread.started"; thread_id: string }
  | { type: "turn.started" }
  | { type: "turn.completed"; usage: CodexUsage }
  | { type: "turn.failed"; error: { message: string } }
  | { type: "item.started"; item: CodexItem }
  | { type: "item.updated"; item: CodexItem }
  | { type: "item.completed"; item: CodexItem }
  | { type: "error"; message: string };

export interface CodexTurnOptions {
  /// The `codex` executable on this machine, from `agentCommand("codex")`.
  command: string;
  /// What to ask. It goes in on stdin, so nothing about it is ever part of a
  /// command line.
  prompt: string;
  cwd: string;
  /// A Codex model slug, or empty to leave the choice to the machine's own
  /// Codex configuration.
  model?: string;
  /// The permission mode the thread runs under, mapped to a sandbox by
  /// `codexSandbox`.
  permissionMode: string;
  /// The thread to continue, absent on the first turn.
  threadId?: string;
  /// Directories outside the workspace the turn may read, for uploads.
  additionalDirectories?: string[];
  env?: NodeJS.ProcessEnv;
}

/// The command line for one turn.
///
/// Kept separate from running it so the flags are something a test can read.
/// The order follows Codex's own SDK: `resume` is a subcommand and comes last,
/// after every flag it applies to.
export function codexArgs(options: CodexTurnOptions): string[] {
  const { sandbox, approval } = codexSandbox(options.permissionMode);
  const args = ["exec", "--experimental-json"];
  if (options.model) args.push("--model", options.model);
  args.push("--sandbox", sandbox);
  args.push("--cd", options.cwd);
  for (const directory of options.additionalDirectories ?? []) args.push("--add-dir", directory);
  // A thread can be started anywhere — the home directory included — and Codex
  // otherwise refuses to run outside a repository.
  args.push("--skip-git-repo-check");
  // A sandbox that can write is no use to an agent that cannot fetch a
  // dependency or push a branch. Still narrower than a thread on Claude, which
  // runs with no sandbox at all.
  if (sandbox === "workspace-write") args.push("--config", "sandbox_workspace_write.network_access=true");
  args.push("--config", `approval_policy="${approval}"`);
  if (options.threadId) args.push("resume", options.threadId);
  return args;
}

/// One line of Codex's output, or nothing when the line is not an event. Codex
/// writes the occasional human-readable line to stdout, and a thread should not
/// fall over because of one.
export function parseCodexEvent(line: string): CodexEvent | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(trimmed) as { type?: unknown };
    return typeof parsed.type === "string" ? (parsed as CodexEvent) : undefined;
  } catch {
    return undefined;
  }
}

/// What one Codex item looks like in Remy's feed. Codex's own id carries
/// through, so an item that starts, updates and completes is one entry that
/// fills in rather than three.
///
/// `turn` is prefixed onto that id, because Codex numbers items within a turn
/// and a turn is a process: without it a second turn's first item would land on
/// top of the first turn's, and the feed would lose a reply rather than gain one.
///
/// Returns nothing for the items Remy renders elsewhere: a to-do list is the
/// thread's plan, not a line in its transcript.
export function codexEntry(item: CodexItem, turn = ""): ConvEntry | undefined {
  const id = `${turn}${item.id}`;
  switch (item.type) {
    case "agent_message":
      return { id, kind: "assistant", text: clip(item.text ?? "", MAX_TEXT) };
    case "reasoning":
      return { id, kind: "thinking", text: clip(item.text ?? "", MAX_THINK) };
    case "command_execution": {
      const entry: ConvEntry = {
        id,
        kind: "tool",
        tool: "Bash",
        verb: "Ran",
        arg: clip(item.command ?? "", MAX_ARG),
      };
      if (item.status !== "in_progress") entry.status = item.status === "failed" || item.exit_code ? "error" : "ok";
      const output = item.aggregated_output?.trim();
      if (output) entry.output = clip(output, MAX_OUTPUT);
      return entry;
    }
    case "file_change": {
      const changes = item.changes ?? [];
      const first = changes[0]?.path;
      const entry: ConvEntry = {
        id,
        kind: "tool",
        tool: "Edit",
        verb: changes.length > 1 ? "Edited" : verbFor(changes[0]?.kind),
        arg: changes.length > 1 ? `${changes.length} files` : base(first),
        status: item.status === "failed" ? "error" : "ok",
      };
      if (changes.length === 1 && first) entry.file = first;
      return entry;
    }
    case "mcp_tool_call": {
      const entry: ConvEntry = {
        id,
        kind: "tool",
        tool: `${item.server}.${item.tool}`,
        verb: "Called",
        arg: clip(item.tool ?? "", MAX_ARG),
      };
      if (item.status !== "in_progress") entry.status = item.status === "failed" ? "error" : "ok";
      if (item.error?.message) entry.output = clip(item.error.message, MAX_OUTPUT);
      return entry;
    }
    case "web_search":
      return {
        id,
        kind: "tool",
        tool: "WebSearch",
        verb: "Searched web",
        arg: clip(item.query ?? "", MAX_ARG),
        status: "ok",
      };
    case "error":
      return { id, kind: "assistant", text: `⚠️ ${clip(item.message ?? "", MAX_TEXT)}` };
    default:
      return undefined;
  }
}

/// Codex's plan, in the shape Remy's own plan panel reads.
export function codexTodos(item: CodexItem): ConvTodo[] {
  if (item.type !== "todo_list") return [];
  return (item.items ?? []).map((todo) => ({
    content: clip(todo.text ?? "", MAX_ARG),
    status: todo.completed ? "completed" : "pending",
  }));
}

/// How full the window is, from what the turn reported. Codex counts the cached
/// part of the prompt separately, and both halves are occupying the window.
export function codexTokens(usage: CodexUsage | undefined): number {
  if (!usage) return 0;
  return num(usage.input_tokens) + num(usage.cached_input_tokens);
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function verbFor(kind: string | undefined): string {
  if (kind === "add") return "Wrote";
  if (kind === "delete") return "Deleted";
  return "Edited";
}

function base(path: string | undefined): string {
  if (!path) return "";
  return path.split("/").filter(Boolean).pop() ?? path;
}

export interface CodexRun {
  /// Ends the turn. Codex leaves the transcript behind, so the next message
  /// resumes what it managed before it was stopped.
  stop(): void;
  /// Settles when the process is gone: rejects with what Codex said when the
  /// turn failed, resolves otherwise.
  done: Promise<void>;
}

/// Runs one turn, calling `onEvent` for each event as it arrives.
export function runCodexTurn(
  options: CodexTurnOptions,
  onEvent: (event: CodexEvent) => void,
): CodexRun {
  const child = spawn(options.command, codexArgs(options), {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stopped = false;
  const stderr: string[] = [];
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    stderr.push(chunk);
    // Keep the tail only: a failed turn needs the last thing Codex said, not
    // every progress line it wrote on the way there.
    if (stderr.length > 40) stderr.splice(0, stderr.length - 40);
  });

  const reader = createInterface({ input: child.stdout!, crlfDelay: Infinity });
  reader.on("line", (line) => {
    const event = parseCodexEvent(line);
    if (event) onEvent(event);
  });

  // Both, in this order. `exit` can arrive while the last lines are still
  // buffered, so a turn that only waited for it would drop the reply it was
  // waiting for; readline's `close` is what says every line has been handled.
  const drained = new Promise<void>((resolve) => reader.once("close", resolve));
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", (error) => reject(new Error(`Codex could not be started: ${error.message}`)));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  const done = (async () => {
    const { code, signal } = await exited;
    await drained;
    if (stopped || signal) return;
    if (code === 0) return;
    const detail = stderr.join("").trim().split("\n").filter(Boolean).pop();
    throw new Error(detail || `Codex exited with code ${code ?? 1}.`);
  })();

  child.stdin?.on("error", () => {
    // Codex that died before reading the prompt is reported by `done`.
  });
  child.stdin?.end(options.prompt);

  return {
    stop() {
      stopped = true;
      child.kill("SIGTERM");
      // A killed child's stdout may never end on its own, and a turn nobody is
      // reading must not leave `done` hanging.
      reader.close();
    },
    done,
  };
}

/// One question, one answer, no thread kept. This is what Remy's own small jobs
/// run on when they run on Codex — read-only, in the home directory, and given
/// up on rather than waited for.
export async function codexAnswer(
  options: Omit<CodexTurnOptions, "permissionMode" | "threadId"> & { timeoutMs: number },
): Promise<string> {
  let answer = "";
  const run = runCodexTurn({ ...options, permissionMode: "plan" }, (event) => {
    if (event.type !== "item.completed") return;
    if (event.item.type === "agent_message") answer += event.item.text ?? "";
  });
  const timer = setTimeout(() => run.stop(), options.timeoutMs);
  timer.unref?.();
  try {
    await run.done;
    return answer;
  } finally {
    clearTimeout(timer);
  }
}
