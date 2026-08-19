import { homedir } from "node:os";
import { query, type Options } from "@anthropic-ai/claude-agent-sdk";
import { agentCommand } from "./agent.js";

/// Names a thread from the message that started it.
///
/// The first line of a request makes a poor title — it is a sentence, often a
/// long one, and it reads as an instruction rather than a subject. This asks
/// the cheap model Remy keeps for its own jobs to write a real one.
///
/// Everything here is best-effort: a thread that cannot be named keeps the
/// title it already had, so nothing waits on this and nothing fails because of
/// it.

const SYSTEM = [
  "You name coding sessions.",
  "Given the request that starts one, reply with a title of at most six words.",
  "Name the subject, not the instruction: 'Flaky login test' rather than 'Fix the flaky login test'.",
  "Reply with the title alone — no quotes, no trailing punctuation, no preamble, no explanation.",
].join(" ");

/// How long a title is worth waiting for. Past this the thread simply keeps the
/// name it was created with.
const TIMEOUT_MS = 25_000;
const MAX_TITLE = 60;

/// Trims a model's answer down to something that belongs in a sidebar. Models
/// like to wrap a title in quotes or add a full stop, and a stray paragraph
/// means the answer was not a title at all.
export function cleanTitle(raw: string): string | undefined {
  const line = raw.trim().split("\n").map((entry) => entry.trim()).find(Boolean);
  if (!line) return undefined;
  const stripped = line
    .replace(/^["'`“”‘’]+|["'`“”‘’]+$/g, "")
    .replace(/[.!]+$/, "")
    .trim();
  if (!stripped) return undefined;
  // A model that explains itself has not answered; keep the existing title
  // rather than putting a paragraph in the sidebar.
  if (stripped.length > MAX_TITLE * 2) return undefined;
  return stripped.slice(0, MAX_TITLE);
}

export async function suggestTitle(request: string, model: string): Promise<string | undefined> {
  // `off` is how someone declines this entirely.
  if (model === "off") return undefined;

  const options: Options = {
    // Home, not the project: this is a one-shot naming call, and it has no
    // business reading the repository or its CLAUDE.md.
    cwd: homedir(),
    pathToClaudeCodeExecutable: agentCommand("claude"),
    systemPrompt: SYSTEM,
    settingSources: [],
    maxTurns: 1,
    allowedTools: [],
    ...(model ? { model } : {}),
  };

  const handle = query({ prompt: `Name the session that starts with this request:\n\n${request}`, options });
  const timeout = setTimeout(() => void handle.interrupt().catch(() => {}), TIMEOUT_MS);
  try {
    let answer = "";
    for await (const message of handle) {
      if (message.type !== "assistant") continue;
      for (const block of message.message.content) {
        if (block.type === "text") answer += block.text;
      }
    }
    return cleanTitle(answer);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}
