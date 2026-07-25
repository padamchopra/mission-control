import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configDir } from "./config.js";

// Global (non-session) server settings, shared by every client that connects.
// Quick replies live here — the source of truth is the Mac, so the iPhone and Mac
// apps see one list without any per-device sync.
interface Settings {
  quickReplies: string[];
}

const settingsFile = join(configDir, "settings.json");

const DEFAULT_QUICK_REPLIES = [
  "Continue", "Run the tests", "Commit and push",
  "Explain your plan first", "Yes, go ahead", "Undo the last change",
];

const MAX_REPLIES = 50;
const MAX_REPLY_LENGTH = 500;

function load(): Settings {
  if (existsSync(settingsFile)) {
    try {
      const parsed = JSON.parse(readFileSync(settingsFile, "utf8")) as Partial<Settings>;
      // An explicit (even empty) stored list is the user's choice; only a
      // missing/corrupt value falls back to the built-in defaults.
      if (Array.isArray(parsed.quickReplies)) {
        return { quickReplies: sanitize(parsed.quickReplies) };
      }
    } catch {
      // corrupt file — start from defaults
    }
  }
  return { quickReplies: [...DEFAULT_QUICK_REPLIES] };
}

let settings = load();

export function getQuickReplies(): string[] {
  return settings.quickReplies;
}

export function setQuickReplies(replies: unknown): string[] {
  const clean = sanitize(replies);
  settings = { ...settings, quickReplies: clean };
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + "\n");
  return clean;
}

// Trim, drop blanks/dupes, and bound length and count so a malformed or hostile
// payload can't bloat the settings file.
function sanitize(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim().slice(0, MAX_REPLY_LENGTH);
    if (!trimmed || out.includes(trimmed)) continue;
    out.push(trimmed);
    if (out.length >= MAX_REPLIES) break;
  }
  return out;
}
