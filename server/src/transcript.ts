import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { config } from "./config.js";
import type { PendingMessage } from "./registry.js";

// A single rendered item in the conversation feed. `kind` picks the renderer on
// the client; the other fields are populated per kind.
export interface ConvEntry {
  id: string;
  kind: "user" | "assistant" | "thinking" | "tool";
  text?: string;
  tool?: string;
  verb?: string;
  arg?: string;
  status?: "ok" | "error";
  output?: string;
  file?: string;
  skill?: string;
  diff?: ConvDiffLine[];
  adds?: number;
  dels?: number;
  questions?: ConvQuestion[];
}

export interface ConvDiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

// One AskUserQuestion prompt. `answer` holds a free-text ("Other") response that
// matched no listed option; a chosen option is marked via its `selected` flag.
export interface ConvQuestion {
  header?: string;
  question: string;
  multiSelect?: boolean;
  options: ConvQuestionOption[];
  answer?: string;
}

export interface ConvQuestionOption {
  label: string;
  description?: string;
  selected?: boolean;
}

export interface ConvTodo {
  content: string;
  status: string; // pending | in_progress | completed
}

export interface Conversation {
  available: boolean;
  title?: string;
  model?: string;
  todos: ConvTodo[];
  entries: ConvEntry[];
  // The session's live hook state, merged in by the endpoint so the feed can show
  // a "working" indicator. `action` is the current step label (e.g. "Reading x").
  state?: string; // working | needs_input | idle | unknown
  action?: string;
  context?: ContextUsage;
  // Prompts queued behind the current turn, merged in by the endpoint. Not in
  // the transcript — Claude Code's queue never reaches disk — so these come
  // from what the server itself sent.
  pending?: PendingMessage[];
  info?: SessionInfo;
}

/// How the session is configured, recorded by Claude Code on its own records as
/// it goes. This is most of what `/status` and `/model` would print, except read
/// straight from the transcript rather than by sending a command whose output
/// only ever renders inside the TUI.
export interface SessionInfo {
  model?: string;
  effort?: string; // reasoning effort: low | medium | high | xhigh | max
  permissionMode?: string; // auto | plan | acceptEdits | bypassPermissions | …
  mode?: string;
  version?: string; // the Claude Code build running this session
  gitBranch?: string;
  slug?: string; // Claude Code's own generated name for the session
}

// How full the session's context window is, and how much history it has already
// burned through. Read from the token accounting Claude Code records on every
// assistant message — the only place this exists, since nothing reports it live.
export interface ContextUsage {
  tokens: number; // context size of the most recent request
  limit: number;
  // True when `limit` is a guess rather than a number this session proved (by
  // auto-compacting) or the operator declared. The client says so.
  limitEstimated: boolean;
  model?: string;
  compactions: number;
  droppedTokens: number; // history discarded by compaction, cumulative
}

// Transcripts grow without bound (tens of MB for long sessions), so we only ever
// read a window from the end. Recent turns — the only thing the feed shows — live
// there, and tool_use/tool_result pairs are adjacent so pairing survives the cut.
const MAX_TAIL = 1_500_000;
// The context meter only needs the newest token accounting, so it reads a much
// smaller window than the feed does — it runs for every session on the fleet
// poll, not just the one on screen.
const USAGE_TAIL = 400_000;
const MAX_TEXT = 4000;
const MAX_THINK = 1200;
const MAX_ARG = 200;
const MAX_OUTPUT = 400;
const MAX_DIFF_SIDE = 30;

const UNAVAILABLE: Conversation = { available: false, todos: [], entries: [] };

// The registry stores the exact transcript path a hook reported. When it hasn't
// (older entries, sessions that predate the hook), reconstruct Claude Code's
// own path scheme from the cwd + session id as a best-effort fallback.
export function resolveTranscriptPath(cwd?: string, sessionId?: string): string | undefined {
  if (!cwd || !sessionId) return undefined;
  const encoded = cwd.replace(/[/.]/g, "-");
  const path = join(homedir(), ".claude", "projects", encoded, `${sessionId}.jsonl`);
  return existsSync(path) ? path : undefined;
}

export function readConversation(path: string | undefined, limit = 120): Conversation {
  if (!path || !existsSync(path)) return UNAVAILABLE;

  const lines = tailLines(path);
  const entries: ConvEntry[] = [];
  const toolIndexById = new Map<string, number>();
  let todos: ConvTodo[] = [];
  let title: string | undefined;
  let model: string | undefined;
  const info: SessionInfo = {};
  let seq = 0;

  for (const o of lines) {
    // Configuration records ride alongside the conversation, and every record
    // carries the build/branch it was written under. Latest wins throughout —
    // these can change mid-session (a /model switch, a branch checkout).
    if (typeof o?.version === "string") info.version = o.version;
    if (typeof o?.gitBranch === "string" && o.gitBranch) info.gitBranch = o.gitBranch;
    if (typeof o?.slug === "string" && o.slug) info.slug = o.slug;
    if (o?.type === "mode" && typeof o.mode === "string") {
      info.mode = o.mode;
      continue;
    }
    if (o?.type === "permission-mode" && typeof o.permissionMode === "string") {
      info.permissionMode = o.permissionMode;
      continue;
    }

    if (o?.type === "ai-title") {
      if (typeof o.aiTitle === "string" && o.aiTitle.trim()) title = o.aiTitle.trim();
      continue;
    }

    if (o?.type === "assistant") {
      const msg = o.message;
      if (typeof msg?.model === "string") model = msg.model;
      if (typeof o.effort === "string") info.effort = o.effort;
      const content = Array.isArray(msg?.content) ? msg.content : [];
      for (const b of content) {
        if (b?.type === "text" && typeof b.text === "string" && b.text.trim()) {
          entries.push({ id: `e${seq++}`, kind: "assistant", text: clip(b.text, MAX_TEXT) });
        } else if (b?.type === "thinking" && typeof b.thinking === "string" && b.thinking.trim()) {
          entries.push({ id: `e${seq++}`, kind: "thinking", text: clip(b.thinking, MAX_THINK) });
        } else if (b?.type === "tool_use") {
          if (b.name === "TodoWrite") {
            const parsed = extractTodos(b.input);
            if (parsed.length) todos = parsed; // latest plan wins
            continue;
          }
          const desc = describeTool(b.name, b.input);
          const entry: ConvEntry = { id: `e${seq++}`, kind: "tool", tool: b.name, verb: desc.verb, arg: desc.arg };
          if (desc.file) entry.file = desc.file;
          if (desc.skill) entry.skill = desc.skill;
          const diff = buildDiff(b.name, b.input);
          if (diff.length) entry.diff = diff;
          const counts = countDiff(b.name, b.input);
          if (counts.adds || counts.dels) {
            entry.adds = counts.adds;
            entry.dels = counts.dels;
          }
          if (b.name === "AskUserQuestion") {
            const questions = buildQuestions(b.input);
            if (questions.length) entry.questions = questions;
          }
          if (typeof b.id === "string") toolIndexById.set(b.id, entries.length);
          entries.push(entry);
        }
      }
      continue;
    }

    if (o?.type === "user") {
      const content = o.message?.content;
      // A tool_result is Claude's own turn reporting an output — attach it to the
      // originating tool chip rather than showing it as a user message.
      if (Array.isArray(content)) {
        const tr = content.find((c: any) => c?.type === "tool_result");
        if (tr) {
          const idx = toolIndexById.get(tr.tool_use_id);
          if (idx != null && entries[idx]) {
            const entry = entries[idx];
            entry.status = tr.is_error ? "error" : "ok";
            if (entry.questions) {
              // The answers are rendered inline on the chips, so skip the
              // redundant "Your questions have been answered: …" text output.
              applyAnswers(entry.questions, (o.toolUseResult as any)?.answers);
            } else {
              const out = resultText(tr.content) ?? resultText(o.toolUseResult);
              if (out) entry.output = clip(out, MAX_OUTPUT);
            }
          }
          continue;
        }
      }
      if (o.isMeta) continue;
      const isHuman = o.origin?.kind === "human" || o.promptSource === "typed";
      const text = userText(content);
      if (isHuman && text && text.trim()) {
        entries.push({ id: `e${seq++}`, kind: "user", text: clip(text, MAX_TEXT) });
      }
    }
  }

  if (model) info.model = model;
  return { available: true, title, model, todos, entries: entries.slice(-limit), info };
}

// Keyed by path + size: a transcript only ever grows, so an unchanged size means
// an unchanged answer. That keeps the fleet poll to one stat() per idle session
// instead of a read, however many clients are watching.
const usageCache = new Map<string, ContextUsage>();
const USAGE_CACHE_MAX = 200;

export function readContextUsage(path: string | undefined): ContextUsage | undefined {
  if (!path || !existsSync(path)) return undefined;
  let size: number;
  try {
    size = statSync(path).size;
  } catch {
    return undefined;
  }
  const key = `${path}:${size}`;
  const hit = usageCache.get(key);
  if (hit) return hit;

  let tokens = 0;
  let peak = 0;
  let model: string | undefined;
  let compactions = 0;
  let droppedTokens = 0;
  // Where this session actually compacts. An automatic compaction is the window
  // announcing itself, so it beats every guess below.
  let autoCompactAt = 0;

  for (const o of tailLines(path, USAGE_TAIL)) {
    if (o?.type === "assistant") {
      const usage = o.message?.usage;
      if (!usage) continue;
      const used =
        num(usage.input_tokens) + num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens);
      if (used > 0) {
        tokens = used; // last one wins — the newest request's context
        if (used > peak) peak = used;
      }
      if (typeof o.message?.model === "string") model = o.message.model;
      continue;
    }
    if (o?.type === "system" && o.subtype === "compact_boundary") {
      compactions += 1;
      const meta = o.compactMetadata;
      if (meta && typeof meta === "object") {
        droppedTokens = Math.max(droppedTokens, num(meta.cumulativeDroppedTokens));
        if (meta.trigger === "auto") autoCompactAt = Math.max(autoCompactAt, num(meta.preTokens));
      }
    }
  }

  if (tokens === 0) return undefined; // a transcript with no completed request yet

  // Fall back through: proved > declared > inferred from what we've seen fit.
  const declared = config.contextLimit;
  const inferred = peak > declared ? 1_000_000 : declared;
  const usage: ContextUsage = {
    tokens,
    limit: autoCompactAt > 0 ? autoCompactAt : inferred,
    limitEstimated: autoCompactAt === 0,
    model,
    compactions,
    droppedTokens,
  };
  if (usageCache.size >= USAGE_CACHE_MAX) usageCache.clear();
  usageCache.set(key, usage);
  return usage;
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function tailLines(path: string, maxBytes = MAX_TAIL): any[] {
  const size = statSync(path).size;
  const start = Math.max(0, size - maxBytes);
  const length = size - start;
  const fd = openSync(path, "r");
  let text: string;
  try {
    const buf = Buffer.allocUnsafe(length);
    readSync(fd, buf, 0, length, start);
    text = buf.toString("utf8");
  } finally {
    closeSync(fd);
  }
  // Drop the partial first line when we didn't start at the file head.
  if (start > 0) {
    const nl = text.indexOf("\n");
    text = nl >= 0 ? text.slice(nl + 1) : "";
  }
  const out: any[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // partial/corrupt line — skip
    }
  }
  return out;
}

function describeTool(name: unknown, input: any): { verb: string; arg: string; file?: string; skill?: string } {
  const n = typeof name === "string" ? name : "tool";
  const inp = input && typeof input === "object" ? input : {};
  switch (n) {
    case "Read":
      return { verb: "Read", arg: base(inp.file_path), file: str(inp.file_path) };
    case "Edit":
    case "MultiEdit":
      return { verb: "Edited", arg: base(inp.file_path), file: str(inp.file_path) };
    case "Write":
      return { verb: "Wrote", arg: base(inp.file_path), file: str(inp.file_path) };
    case "NotebookEdit":
      return { verb: "Edited", arg: base(inp.notebook_path), file: str(inp.notebook_path) };
    case "Bash":
      return { verb: "Ran", arg: clip(str(inp.command) ?? str(inp.description) ?? "", MAX_ARG) };
    case "Grep":
      return { verb: "Searched", arg: clip(str(inp.pattern) ?? "", MAX_ARG) };
    case "Glob":
      return { verb: "Globbed", arg: clip(str(inp.pattern) ?? "", MAX_ARG) };
    case "LS":
      return { verb: "Listed", arg: base(inp.path) };
    case "Task":
    case "Agent":
      return { verb: "Delegated", arg: clip(str(inp.description) ?? str(inp.subagent_type) ?? "", MAX_ARG) };
    case "Skill":
      return { verb: "Skill", arg: clip(str(inp.skill) ?? "", MAX_ARG), skill: str(inp.skill) };
    case "WebFetch":
      return { verb: "Fetched", arg: clip(str(inp.url) ?? "", MAX_ARG) };
    case "WebSearch":
      return { verb: "Searched web", arg: clip(str(inp.query) ?? "", MAX_ARG) };
    case "AskUserQuestion": {
      const qs = Array.isArray(inp.questions) ? inp.questions : [];
      const first = str(qs[0]?.header) ?? str(qs[0]?.question) ?? "";
      const arg = qs.length > 1 ? `${qs.length} questions` : first;
      return { verb: "Asked", arg: clip(arg, MAX_ARG) };
    }
    default:
      return { verb: n, arg: clip(firstString(inp), MAX_ARG) };
  }
}

function buildDiff(name: unknown, input: any): ConvDiffLine[] {
  const inp = input && typeof input === "object" ? input : {};
  if (name === "Edit") return pairDiff(str(inp.old_string), str(inp.new_string));
  if (name === "MultiEdit" && Array.isArray(inp.edits)) {
    const out: ConvDiffLine[] = [];
    for (const e of inp.edits) {
      for (const l of pairDiff(str(e?.old_string), str(e?.new_string))) out.push(l);
      if (out.length > MAX_DIFF_SIDE * 2) break;
    }
    return out.slice(0, MAX_DIFF_SIDE * 2);
  }
  if (name === "Write" && typeof inp.content === "string") {
    return sideLines(inp.content, "add");
  }
  return [];
}

// Accurate (uncapped) added/removed line counts for the Changes inspector,
// counted the same naive way the diff is built: every old line is a deletion,
// every new line an addition.
function countDiff(name: unknown, input: any): { adds: number; dels: number } {
  const inp = input && typeof input === "object" ? input : {};
  if (name === "Edit") return { dels: lineCount(str(inp.old_string)), adds: lineCount(str(inp.new_string)) };
  if (name === "MultiEdit" && Array.isArray(inp.edits)) {
    let adds = 0;
    let dels = 0;
    for (const e of inp.edits) {
      dels += lineCount(str(e?.old_string));
      adds += lineCount(str(e?.new_string));
    }
    return { adds, dels };
  }
  if (name === "Write" && typeof inp.content === "string") return { adds: lineCount(inp.content), dels: 0 };
  return { adds: 0, dels: 0 };
}

function lineCount(text?: string): number {
  return text ? text.split("\n").length : 0;
}

function pairDiff(oldStr?: string, newStr?: string): ConvDiffLine[] {
  return [...sideLines(oldStr ?? "", "del"), ...sideLines(newStr ?? "", "add")];
}

function sideLines(text: string, kind: "add" | "del"): ConvDiffLine[] {
  if (!text) return [];
  const lines = text.split("\n");
  const shown: ConvDiffLine[] = lines.slice(0, MAX_DIFF_SIDE).map((text) => ({ kind, text }));
  if (lines.length > MAX_DIFF_SIDE) {
    shown.push({ kind: "ctx", text: `… ${lines.length - MAX_DIFF_SIDE} more lines` });
  }
  return shown;
}

function buildQuestions(input: any): ConvQuestion[] {
  const qs = input && Array.isArray(input.questions) ? input.questions : [];
  const out: ConvQuestion[] = [];
  for (const q of qs) {
    const question = str(q?.question);
    if (!question) continue;
    const options: ConvQuestionOption[] = [];
    if (Array.isArray(q.options)) {
      for (const opt of q.options) {
        const label = str(opt?.label);
        if (!label) continue;
        const o: ConvQuestionOption = { label: clip(label, MAX_ARG) };
        const description = str(opt?.description);
        if (description) o.description = clip(description, MAX_TEXT);
        options.push(o);
      }
    }
    const entry: ConvQuestion = { question: clip(question, MAX_TEXT), options };
    const header = str(q.header);
    if (header) entry.header = header;
    if (q.multiSelect === true) entry.multiSelect = true;
    out.push(entry);
  }
  return out;
}

// Mark the option(s) the user picked from `toolUseResult.answers` (question text
// → chosen label, or an array for multiSelect). A pick that matches no listed
// option is an "Other" free-text response, kept on `answer`.
function applyAnswers(questions: ConvQuestion[], answers: unknown): void {
  if (!answers || typeof answers !== "object") return;
  const map = answers as Record<string, unknown>;
  const byTrimmed = new Map<string, unknown>();
  for (const [k, v] of Object.entries(map)) byTrimmed.set(k.trim(), v);
  for (const q of questions) {
    const raw = q.question in map ? map[q.question] : byTrimmed.get(q.question.trim());
    if (raw == null) continue;
    const picks = (Array.isArray(raw) ? raw : [raw]).map((p) => String(p)).filter((p) => p.length > 0);
    const free: string[] = [];
    for (const pick of picks) {
      const opt = q.options.find((o) => o.label === pick || o.label === pick.trim());
      if (opt) opt.selected = true;
      else free.push(pick);
    }
    if (free.length) q.answer = clip(free.join(", "), MAX_TEXT);
  }
}

function extractTodos(input: any): ConvTodo[] {
  const todos = input && Array.isArray(input.todos) ? input.todos : [];
  return todos
    .map((t: any) => ({ content: str(t?.content) ?? str(t?.activeForm) ?? "", status: str(t?.status) ?? "pending" }))
    .filter((t: ConvTodo) => t.content.length > 0);
}

function userText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c: any) => c?.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n");
  }
  return "";
}

function resultText(content: unknown): string | undefined {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const joined = content
      .filter((c: any) => c?.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n");
    return joined || undefined;
  }
  if (content && typeof content === "object") {
    const obj = content as Record<string, unknown>;
    return str(obj.stdout) ?? str(obj.output) ?? undefined;
  }
  return undefined;
}

function firstString(obj: Record<string, unknown>): string {
  for (const v of Object.values(obj)) if (typeof v === "string" && v.trim()) return v;
  return "";
}

function base(path: unknown): string {
  const s = str(path);
  if (!s) return "";
  const parts = s.split("/");
  return parts[parts.length - 1] || s;
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function clip(text: string, max: number): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}
