import { execFile, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);
// Must start with an alphanumeric/underscore so a name can never be read as a
// tmux flag (leading "-") or a path segment ("."/".."/leading dot).
const NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const FIELD_SEP = "\x1f";
let bufferCounter = 0;

export function assertValidName(name: string): void {
  if (name.length > 128 || !NAME_RE.test(name)) throw new Error(`invalid session name: ${name}`);
}

export interface TmuxSession {
  name: string;
  createdAt: number;
  lastOutputAt: number;
  attachedClients: number;
  paneCommand: string;
  panePath: string;
}

const LIST_FORMAT = [
  "#{session_name}",
  "#{session_created}",
  "#{session_activity}",
  "#{session_attached}",
  "#{pane_current_command}",
  "#{pane_current_path}",
].join(FIELD_SEP);

export async function listSessions(): Promise<TmuxSession[]> {
  let stdout: string;
  try {
    ({ stdout } = await exec("tmux", ["list-panes", "-a", "-F", LIST_FORMAT]));
  } catch {
    return []; // no tmux server running
  }
  const seen = new Map<string, TmuxSession>();
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    const [name, created, activity, attached, paneCommand, panePath] = line.split(FIELD_SEP);
    if (!name || seen.has(name)) continue;
    seen.set(name, {
      name,
      createdAt: Number(created),
      lastOutputAt: Number(activity),
      attachedClients: Number(attached),
      paneCommand: paneCommand ?? "",
      panePath: panePath ?? "",
    });
  }
  return [...seen.values()].sort((a, b) => b.lastOutputAt - a.lastOutputAt);
}

// Bracketed paste so newlines in the text never submit early; Enter is sent
// separately only when the caller wants submission.
export async function sendText(name: string, text: string, submit: boolean): Promise<void> {
  assertValidName(name);
  if (text.length > 0) {
    // Unique buffer per call so concurrent sends to different sessions can't
    // race on a shared buffer and deliver each other's text.
    const buffer = `mc-${process.pid}-${bufferCounter++}`;
    await tmuxWithStdin(["load-buffer", "-b", buffer, "-"], text);
    await exec("tmux", ["paste-buffer", "-p", "-d", "-b", buffer, "-t", name]);
  }
  if (submit) {
    await exec("tmux", ["send-keys", "-t", name, "Enter"]);
  }
}

const KEY_MAP: Record<string, string> = {
  enter: "Enter",
  escape: "Escape",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  tab: "Tab",
  "shift-tab": "BTab",
  backspace: "BSpace",
  "ctrl-c": "C-c",
};

export async function sendKeys(name: string, keys: string[]): Promise<void> {
  assertValidName(name);
  const mapped = keys.map((k) => {
    const named = KEY_MAP[k.toLowerCase()];
    if (named) return named;
    if (/^[a-zA-Z0-9]$/.test(k)) return k;
    throw new Error(`unsupported key: ${k}`);
  });
  if (mapped.length === 0) return;
  await exec("tmux", ["send-keys", "-t", name, ...mapped]);
}

export type ScrollAction = "up" | "down" | "page-up" | "page-down" | "top" | "bottom";

const SCROLL_X_COMMAND: Record<Exclude<ScrollAction, "bottom">, string> = {
  up: "scroll-up",
  down: "scroll-down",
  "page-up": "page-up",
  "page-down": "page-down",
  top: "history-top",
};

// Scrolls the tmux pane's own history via copy-mode, driven by send-keys — the
// only path that works here, since the attached client keeps no local scrollback.
// "up"/"down" scroll `lines` lines (for the pan gesture); "bottom" cancels
// copy-mode, snapping back to the live prompt. Returns whether the pane is still
// in copy-mode afterwards, so the client can show/hide its jump-to-bottom button.
export async function scroll(name: string, action: ScrollAction, lines = 1): Promise<boolean> {
  assertValidName(name);
  if (action !== "bottom" && !(action in SCROLL_X_COMMAND)) {
    throw new Error(`invalid scroll action: ${action}`);
  }
  if (action === "bottom") {
    await exec("tmux", ["send-keys", "-t", name, "-X", "cancel"]).catch(() => {});
    return paneInCopyMode(name);
  }
  // Entering copy-mode when there's nothing to scroll just freezes the pane at
  // [0/0]: alternate-screen TUIs (vim, less) have no tmux scrollback, and a
  // fresh pane has no history yet. Skip instead of trapping the view there.
  const { stdout: state } = await exec("tmux", [
    "display-message", "-p", "-t", name,
    ["#{pane_in_mode}", "#{alternate_on}", "#{history_size}"].join(FIELD_SEP),
  ]);
  const [inMode, altOn, histSize] = state.trim().split(FIELD_SEP);
  if (inMode !== "1") {
    if (altOn === "1" || Number(histSize) === 0) return false;
    if (action === "down" || action === "page-down") return false; // already at the live prompt
  }
  // -e auto-exits copy-mode when scrolled back to the bottom.
  await exec("tmux", ["copy-mode", "-e", "-t", name]);
  const command = SCROLL_X_COMMAND[action];
  if (action === "up" || action === "down") {
    const n = String(Math.min(Math.max(Math.trunc(lines) || 1, 1), 500));
    await exec("tmux", ["send-keys", "-t", name, "-N", n, "-X", command]);
  } else {
    await exec("tmux", ["send-keys", "-t", name, "-X", command]);
  }
  return paneInCopyMode(name);
}

export async function paneInCopyMode(name: string): Promise<boolean> {
  assertValidName(name);
  try {
    const { stdout } = await exec("tmux", ["display-message", "-p", "-t", name, "#{pane_in_mode}"]);
    return stdout.trim() === "1";
  } catch {
    return false;
  }
}

export async function paneCurrentPath(name: string): Promise<string | undefined> {
  assertValidName(name);
  try {
    const { stdout } = await exec("tmux", ["display-message", "-p", "-t", name, "#{pane_current_path}"]);
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

// Starts a detached session in any directory (default: home). Optionally
// launches Claude via a fixed argv. Used by the top-level "New session" action,
// independent of any saved workspace.
export async function newShellSession(options: { name?: string; path?: string; claude?: boolean }): Promise<string> {
  const requested = options.name?.trim();
  const name = requested && requested.length > 0 ? requested : `session-${randomUUID().slice(0, 6)}`;
  assertValidName(name);
  const cwd = options.path?.trim() || homedir();
  if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw new Error("path is not a directory");
  }
  const args = ["new-session", "-d", "-s", name, "-c", cwd];
  if (options.claude) args.push("claude");
  await exec("tmux", args);
  return name;
}

export async function killSession(name: string): Promise<void> {
  assertValidName(name);
  await exec("tmux", ["kill-session", "-t", name]);
}

export async function renameSession(name: string, newName: string): Promise<void> {
  assertValidName(name);
  assertValidName(newName);
  await exec("tmux", ["rename-session", "-t", name, newName]);
}

export async function capturePane(name: string, lines: number): Promise<string> {
  assertValidName(name);
  const n = Math.min(Math.max(Math.trunc(lines) || 120, 1), 2000);
  const { stdout } = await exec("tmux", ["capture-pane", "-p", "-J", "-t", name, "-S", `-${n}`]);
  return stdout.replace(/\s+$/, "");
}

function tmuxWithStdin(args: string[], input: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("tmux", args, { stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr || `tmux exited ${code}`))));
    child.stdin.end(input);
  });
}
