import { execFile } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface SessionLinks {
  claudeUrl: string | null;
  prUrl: string | null;
}

export async function resolveLinks(cwd: string | undefined, claudeSessionId: string | undefined): Promise<SessionLinks> {
  return {
    claudeUrl: claudeWebUrl(claudeSessionId),
    prUrl: await prForCwd(cwd),
  };
}

// Claude Code records each session's cloud "bridge" id in ~/.claude/sessions/<pid>.json,
// keyed by the local sessionId. That bridge id — not the local UUID — is what
// claude.ai/code addresses. Sessions that aren't bridged have no web URL.
function claudeWebUrl(localSessionId: string | undefined): string | null {
  if (!localSessionId) return null;
  const dir = join(homedir(), ".claude", "sessions");
  try {
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".json")) continue;
      try {
        const meta = JSON.parse(readFileSync(join(dir, file), "utf8"));
        if (meta.sessionId === localSessionId && typeof meta.bridgeSessionId === "string" && meta.bridgeSessionId) {
          return `https://claude.ai/code/${meta.bridgeSessionId}`;
        }
      } catch {
        // skip unreadable/partial session file
      }
    }
  } catch {
    // no sessions dir
  }
  return null;
}

// Each lookup is a GitHub API call under the user's token; clients poll for
// the link, so cache per directory to bound the API rate regardless of how
// many screens are open or how fast they refresh.
const PR_CACHE_TTL_MS = 60_000;
const prCache = new Map<string, { url: string | null; at: number }>();

async function prForCwd(cwd: string | undefined): Promise<string | null> {
  if (!cwd) return null;
  const cached = prCache.get(cwd);
  if (cached && Date.now() - cached.at < PR_CACHE_TTL_MS) return cached.url;
  const url = await fetchPrUrl(cwd);
  prCache.set(cwd, { url, at: Date.now() });
  return url;
}

async function fetchPrUrl(cwd: string): Promise<string | null> {
  try {
    const { stdout } = await exec("gh", ["pr", "view", "--json", "url", "-q", ".url"], { cwd });
    return stdout.trim() || null;
  } catch (err) {
    // "No PR for this branch" is the normal case; anything else (gh missing,
    // not authenticated) would otherwise fail invisibly — surface it in the log.
    const detail = String((err as { stderr?: unknown })?.stderr ?? err ?? "").trim();
    if (detail && !/no pull requests found|not a git repository/i.test(detail)) {
      console.error(`pr lookup failed in ${cwd}:`, detail);
    }
    return null;
  }
}

export interface WorktreeInfo {
  isWorktree: boolean;
  path?: string;
  branch?: string;
  dirty?: boolean;
}

interface WorktreeEntry {
  path: string;
}

function parseWorktreeList(porcelain: string): WorktreeEntry[] {
  const entries: WorktreeEntry[] = [];
  for (const line of porcelain.split("\n")) {
    if (line.startsWith("worktree ")) entries.push({ path: line.slice("worktree ".length).trim() });
  }
  return entries;
}

export async function worktreeInfo(cwd: string | undefined): Promise<WorktreeInfo> {
  if (!cwd) return { isWorktree: false };
  try {
    const [{ stdout: top }, { stdout: list }] = await Promise.all([
      exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"]),
      exec("git", ["-C", cwd, "worktree", "list", "--porcelain"]),
    ]);
    const toplevel = top.trim();
    const worktrees = parseWorktreeList(list);
    // The first entry is the main worktree; only linked worktrees are removable.
    const isLinked = worktrees.length > 1 && worktrees[0].path !== toplevel && worktrees.some((w) => w.path === toplevel);
    if (!isLinked) return { isWorktree: false };
    const [{ stdout: branch }, { stdout: status }] = await Promise.all([
      exec("git", ["-C", cwd, "rev-parse", "--abbrev-ref", "HEAD"]),
      exec("git", ["-C", cwd, "status", "--porcelain"]),
    ]);
    return { isWorktree: true, path: toplevel, branch: branch.trim(), dirty: status.trim().length > 0 };
  } catch {
    return { isWorktree: false };
  }
}

// Removes a linked worktree, keeping its branch. Validates that `path` is a
// registered non-main worktree so this can never remove an arbitrary directory.
export async function removeWorktree(path: string, force: boolean): Promise<void> {
  const { stdout } = await exec("git", ["-C", path, "worktree", "list", "--porcelain"]);
  const worktrees = parseWorktreeList(stdout);
  if (worktrees.length === 0) throw new Error("not a git repository");
  const main = worktrees[0].path;
  if (path === main) throw new Error("refusing to remove the main worktree");
  if (!worktrees.some((w) => w.path === path)) throw new Error("not a registered worktree");
  const args = ["-C", main, "worktree", "remove"];
  if (force) args.push("--force");
  args.push(path);
  await exec("git", args);
}
