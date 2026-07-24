import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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
}

export interface ConvDiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
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
}

// Transcripts grow without bound (tens of MB for long sessions), so we only ever
// read a window from the end. Recent turns — the only thing the feed shows — live
// there, and tool_use/tool_result pairs are adjacent so pairing survives the cut.
const MAX_TAIL = 1_500_000;
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
  let seq = 0;

  for (const o of lines) {
    if (o?.type === "ai-title") {
      if (typeof o.aiTitle === "string" && o.aiTitle.trim()) title = o.aiTitle.trim();
      continue;
    }

    if (o?.type === "assistant") {
      const msg = o.message;
      if (typeof msg?.model === "string") model = msg.model;
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
            entries[idx].status = tr.is_error ? "error" : "ok";
            const out = resultText(tr.content) ?? resultText(o.toolUseResult);
            if (out) entries[idx].output = clip(out, MAX_OUTPUT);
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

  return { available: true, title, model, todos, entries: entries.slice(-limit) };
}

function tailLines(path: string): any[] {
  const size = statSync(path).size;
  const start = Math.max(0, size - MAX_TAIL);
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
