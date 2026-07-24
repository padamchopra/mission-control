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

export async function resolveLinks(
  cwd: string | undefined,
  claudeSessionId: string | undefined,
  refreshPr = false,
  includePullRequest = true,
): Promise<SessionLinks> {
  return {
    claudeUrl: claudeWebUrl(claudeSessionId),
    prUrl: includePullRequest ? await prForCwd(cwd, refreshPr) : null,
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

async function prForCwd(cwd: string | undefined, refresh = false): Promise<string | null> {
  if (!cwd) return null;
  const cached = prCache.get(cwd);
  if (!refresh && cached && Date.now() - cached.at < PR_CACHE_TTL_MS) return cached.url;
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

export interface CheckRun {
  name: string;
  state: string; // pass | fail | pending | skipping | cancel | ...
}

export interface ChecksResult {
  available: boolean;
  checks: CheckRun[];
}

const CHECKS_CACHE_TTL_MS = 30_000;
const checksCache = new Map<string, { result: ChecksResult; at: number }>();

// CI status for the branch's open PR, via `gh pr checks`. Same per-directory
// caching as the PR link so polling clients don't hammer the GitHub API.
export async function resolveChecks(cwd: string | undefined, refresh = false): Promise<ChecksResult> {
  if (!cwd) return { available: false, checks: [] };
  const cached = checksCache.get(cwd);
  if (!refresh && cached && Date.now() - cached.at < CHECKS_CACHE_TTL_MS) return cached.result;
  const result = await fetchChecks(cwd);
  checksCache.set(cwd, { result, at: Date.now() });
  return result;
}

function parseChecks(raw: string): CheckRun[] {
  const parsed = JSON.parse(raw || "[]");
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((c: any) => ({
      name: String(c.name ?? c.workflow ?? "").trim(),
      state: String(c.bucket ?? c.state ?? "").toLowerCase(),
    }))
    .filter((c) => c.name.length > 0);
}

async function fetchChecks(cwd: string): Promise<ChecksResult> {
  try {
    const { stdout } = await exec("gh", ["pr", "checks", "--json", "name,state,bucket,workflow"], { cwd });
    return { available: true, checks: parseChecks(stdout.trim()) };
  } catch (err) {
    // `gh pr checks` exits non-zero when any check is failing or pending, yet
    // still prints the JSON to stdout — recover that before treating it as "no PR".
    const out = String((err as { stdout?: unknown })?.stdout ?? "").trim();
    if (out) {
      try {
        return { available: true, checks: parseChecks(out) };
      } catch {
        // fall through to the no-PR path
      }
    }
    const detail = String((err as { stderr?: unknown })?.stderr ?? err ?? "").trim();
    if (detail && !/no pull requests found|no checks reported|not a git repository/i.test(detail)) {
      console.error(`checks lookup failed in ${cwd}:`, detail);
    }
    return { available: false, checks: [] };
  }
}

export interface DiffStat {
  files: number;
  adds: number;
  dels: number;
}

const DIFFSTAT_CACHE_TTL_MS = 15_000;
const diffStatCache = new Map<string, { stat: DiffStat | null; at: number }>();

// Uncommitted changes vs HEAD as a compact +/- summary for fleet cards.
export async function diffStatFor(cwd: string | undefined): Promise<DiffStat | null> {
  if (!cwd) return null;
  const cached = diffStatCache.get(cwd);
  if (cached && Date.now() - cached.at < DIFFSTAT_CACHE_TTL_MS) return cached.stat;
  const stat = await computeDiffStat(cwd);
  diffStatCache.set(cwd, { stat, at: Date.now() });
  return stat;
}

async function computeDiffStat(cwd: string): Promise<DiffStat | null> {
  try {
    const { stdout } = await exec("git", ["-C", cwd, "diff", "--numstat", "HEAD"]);
    let files = 0;
    let adds = 0;
    let dels = 0;
    for (const line of stdout.split("\n")) {
      if (!line.trim()) continue;
      const [a, d] = line.split("\t");
      files += 1;
      adds += Number(a) || 0;
      dels += Number(d) || 0;
    }
    return files === 0 ? null : { files, adds, dels };
  } catch {
    return null; // not a repo, no HEAD yet, detached, etc.
  }
}

// Opens a PR for the current branch. With no title, `--fill` derives title/body
// from the commits. Returns the PR URL gh prints.
export async function createPullRequest(cwd: string | undefined, title?: string, body?: string): Promise<string> {
  if (!cwd) throw new Error("no directory");
  const args = ["pr", "create"];
  if (title && title.trim()) {
    args.push("--title", title.trim(), "--body", (body ?? "").trim());
  } else {
    args.push("--fill");
  }
  const { stdout } = await exec("gh", args, { cwd });
  prCache.delete(cwd);
  checksCache.delete(cwd);
  return stdout.trim().split("\n").pop()?.trim() ?? "";
}

// Squash-merges the branch's PR. `auto` enables merge-when-green (GitHub merges
// once required checks pass) instead of merging immediately.
export async function mergePullRequest(cwd: string | undefined, auto: boolean): Promise<void> {
  if (!cwd) throw new Error("no directory");
  const args = ["pr", "merge", "--squash"];
  if (auto) args.push("--auto");
  await exec("gh", args, { cwd });
  checksCache.delete(cwd);
}

export interface ReviewComment {
  author: string;
  body: string;
  state?: string;
}

export async function reviewComments(cwd: string | undefined): Promise<ReviewComment[]> {
  if (!cwd) return [];
  try {
    const { stdout } = await exec("gh", ["pr", "view", "--json", "reviews,comments"], { cwd });
    const parsed = JSON.parse(stdout || "{}");
    const out: ReviewComment[] = [];
    for (const review of parsed.reviews ?? []) {
      const body = String(review.body ?? "").trim();
      const state = String(review.state ?? "").trim();
      if (body || state) out.push({ author: login(review.author), body, state });
    }
    for (const comment of parsed.comments ?? []) {
      const body = String(comment.body ?? "").trim();
      if (body) out.push({ author: login(comment.author), body });
    }
    return out;
  } catch {
    return [];
  }
}

function login(author: unknown): string {
  if (author && typeof author === "object" && "login" in author) return String((author as { login: unknown }).login ?? "");
  return String(author ?? "");
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
