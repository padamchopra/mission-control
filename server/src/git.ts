import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface SessionLinks {
  claudeUrl: string | null;
  prUrl: string | null;
}

export async function resolveLinks(cwd: string | undefined, claudeSessionId: string | undefined): Promise<SessionLinks> {
  return {
    claudeUrl: claudeSessionId ? `https://claude.ai/code/${encodeURIComponent(claudeSessionId)}` : null,
    prUrl: await prForCwd(cwd),
  };
}

async function prForCwd(cwd: string | undefined): Promise<string | null> {
  if (!cwd) return null;
  try {
    const { stdout } = await exec("gh", ["pr", "view", "--json", "url", "-q", ".url"], { cwd });
    return stdout.trim() || null;
  } catch {
    return null; // no PR for this branch, or not a gh repo
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
