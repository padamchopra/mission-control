import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { db, runTransaction } from "./db.js";
import { findProjectFiles } from "./discovery.js";
import { run as exec } from "./run.js";
import { agentCommand, type AgentKind } from "./agent.js";
import { assertValidName, killSession, listSessions, newShellSession, sendText, waitForAgentComposer } from "./tmux.js";

/** A workspace is a folder on this machine. Git metadata is attached when the folder is a checkout. */
export interface Workspace {
  id: string;
  name: string;
  /** Absolute path the agent runs in. */
  path: string;
  /** Display form of the `origin` remote (host/owner/repo), if any. */
  origin: string | null;
  icon: string | null;
  tint: string | null;
  worktrees: GitWorktree[];
}

export interface GitWorktree {
  path: string;
  branch: string | null;
  isMain: boolean;
  dirty: boolean;
}

interface StoredWorkspace {
  id: string;
  name: string;
  path: string;
  icon: string | null;
  tint: string | null;
}

interface ParsedWorktree {
  path: string;
  branch: string | null;
}

function load(): StoredWorkspace[] {
  return (
    db.prepare("select id, name, path, icon, tint from workspaces").all() as {
      id: string;
      name: string;
      path: string;
      icon: string | null;
      tint: string | null;
    }[]
  ).map((row) => ({ id: row.id, name: row.name, path: row.path, icon: row.icon, tint: row.tint }));
}

function save(workspaces: StoredWorkspace[]): void {
  runTransaction(() => {
    db.exec("delete from workspaces");
    const insert = db.prepare("insert into workspaces (id, name, path, icon, tint) values (?, ?, ?, ?, ?)");
    for (const workspace of workspaces) insert.run(workspace.id, workspace.name, workspace.path, workspace.icon, workspace.tint);
  });
}

// Lists a repository's worktrees WITHOUT chdir'ing into it. On external/USB
// volumes, chdir + git's `getcwd()` returns EINTR ("Interrupted system call"),
// which no amount of retrying reliably beats. Running from a fast local cwd
// (home) with an explicit --git-dir keeps getcwd() off the slow volume. Only a
// primary checkout has .git as a real directory; a linked worktree (.git file)
// falls back to -C.
async function worktreeListPorcelain(repoPath: string): Promise<string> {
  const gitDir = join(repoPath, ".git");
  if (existsSync(gitDir) && statSync(gitDir).isDirectory()) {
    const { stdout } = await exec(
      "git",
      ["--git-dir", gitDir, "--work-tree", repoPath, "worktree", "list", "--porcelain"],
      { cwd: homedir(), timeout: 8000 },
    );
    return stdout;
  }
  const { stdout } = await exec("git", ["-C", repoPath, "worktree", "list", "--porcelain"], { cwd: homedir(), timeout: 8000 });
  return stdout;
}

// Resolves a worktree's git directory without chdir'ing: a primary checkout has
// .git as a directory; a linked worktree has a .git file "gitdir: <path>".
function gitDirFor(worktreePath: string): string | null {
  const dotGit = join(worktreePath, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return dotGit;
    const match = readFileSync(dotGit, "utf8").trim().match(/^gitdir:\s*(.+)$/);
    if (match) {
      const pointer = match[1].trim();
      return pointer.startsWith("/") ? pointer : join(worktreePath, pointer);
    }
  } catch {
    // fall through
  }
  return null;
}

// Dirty state of a worktree, computed WITHOUT chdir'ing into it (so git's
// getcwd() never touches an EINTR-prone external volume). Conservative on error.
async function worktreeDirty(worktreePath: string): Promise<boolean> {
  const gitDir = gitDirFor(worktreePath);
  try {
    const args = gitDir
      ? ["--git-dir", gitDir, "--work-tree", worktreePath, "status", "--porcelain"]
      : ["-C", worktreePath, "status", "--porcelain"];
    const { stdout } = await exec("git", args, { cwd: homedir() });
    return stdout.trim().length > 0;
  } catch {
    return true;
  }
}

function gitErrorDetail(error: unknown): string {
  const e = error as { stderr?: unknown; message?: unknown };
  const stderr = typeof e?.stderr === "string" ? e.stderr : "";
  const message = typeof e?.message === "string" ? e.message : "";
  return (stderr || message)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(" ")
    .slice(0, 300);
}

function parseWorktreeList(porcelain: string): ParsedWorktree[] {
  return porcelain
    .split("\n\n")
    .map((block) => {
      const path = block.split("\n").find((line) => line.startsWith("worktree "))?.slice("worktree ".length).trim();
      const ref = block.split("\n").find((line) => line.startsWith("branch "))?.slice("branch ".length).trim();
      return path ? { path, branch: ref?.replace(/^refs\/heads\//, "") ?? null } : null;
    })
    .filter((entry): entry is ParsedWorktree => entry !== null);
}

function expandHome(rawPath: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed) return homedir();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  if (isAbsolute(trimmed)) return trimmed;
  return resolve(homedir(), trimmed);
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isGitCheckout(path: string): boolean {
  try {
    return existsSync(join(path, ".git"));
  } catch {
    return false;
  }
}

async function repositoryForPath(rawPath: string): Promise<{ mainPath: string; origin: string | null; worktrees: GitWorktree[] }> {
  const expanded = expandHome(rawPath);
  if (!existsSync(expanded) || !statSync(expanded).isDirectory()) throw new Error("path is not a directory");
  const path = realpathSync(expanded);
  let porcelain: string;
  try {
    porcelain = await worktreeListPorcelain(path);
  } catch (error) {
    // Surface git's real reason (and the resolved path we tried) instead of a
    // fixed string — external drives, permissions, and dubious ownership all
    // fail here and are indistinguishable without it.
    const detail = gitErrorDetail(error);
    throw new Error(detail ? `Git couldn't read a repository at "${path}": ${detail}` : `no Git repository at "${path}"`);
  }
  const entries = parseWorktreeList(porcelain).map((entry) => {
    try {
      // Match tmux's resolved pane paths even when Git was configured through
      // a symlink (for example /tmp on macOS).
      return { ...entry, path: realpathSync(entry.path) };
    } catch {
      return entry;
    }
  });
  if (entries.length === 0) throw new Error("Git repository has no worktrees");

  // Git documents the primary checkout as the first worktree in this output.
  const mainPath = entries[0].path;
  // Dirty state is deliberately NOT computed here: `git status` walks the whole
  // working tree, which is slow on large repos / external drives — and this runs
  // on every fleet poll. It's fetched on demand (the repository sheet) and
  // recomputed fresh at close time, where accuracy actually matters.
  const worktrees = entries.map((entry, index) => ({
    path: entry.path,
    branch: entry.branch,
    isMain: index === 0,
    dirty: false,
  }));
  let origin: string | null = null;
  try {
    // No chdir into the repo — see worktreeListPorcelain. This runs once per
    // existing workspace during add's dedupe, so a chdir stall here is N× costly.
    const gitDir = join(path, ".git");
    const args = existsSync(gitDir) && statSync(gitDir).isDirectory()
      ? ["--git-dir", gitDir, "remote", "get-url", "origin"]
      : ["-C", path, "remote", "get-url", "origin"];
    const { stdout } = await exec("git", args, { cwd: homedir(), timeout: 8000 });
    origin = normalizeRemote(stdout.trim());
  } catch {
    origin = null;
  }
  return { mainPath, origin, worktrees };
}

// git@github.com:owner/repo.git / https://github.com/owner/repo.git → github.com/owner/repo
function normalizeRemote(url: string): string | null {
  if (!url) return null;
  const stripped = url
    .replace(/\.git$/, "")
    .replace(/^git@([^:]+):/, "$1/")
    .replace(/^ssh:\/\//, "")
    .replace(/^https?:\/\//, "");
  return stripped || null;
}

// Resolving a workspace shells out to git several times per checkout, which is
// slow on external/network volumes. The fleet polls this every few seconds, so
// cache the result briefly and de-dupe concurrent scans; mutations invalidate it.
let workspacesCache: { at: number; workspaces: Workspace[] } | null = null;
let workspacesInFlight: Promise<Workspace[]> | null = null;
const WORKSPACES_TTL_MS = 8000;

export function invalidateWorkspacesCache(): void {
  workspacesCache = null;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  if (workspacesCache && Date.now() - workspacesCache.at < WORKSPACES_TTL_MS) return workspacesCache.workspaces;
  if (workspacesInFlight) return workspacesInFlight;
  workspacesInFlight = computeWorkspaces()
    .then((workspaces) => {
      workspacesCache = { at: Date.now(), workspaces };
      return workspaces;
    })
    .finally(() => {
      workspacesInFlight = null;
    });
  return workspacesInFlight;
}

async function gitMetadata(path: string): Promise<{ origin: string | null; worktrees: GitWorktree[] }> {
  if (!isGitCheckout(path)) return { origin: null, worktrees: [] };
  try {
    const repository = await repositoryForPath(path);
    return { origin: repository.origin, worktrees: repository.worktrees };
  } catch {
    return { origin: null, worktrees: [] };
  }
}

async function hydrateWorkspace(stored: StoredWorkspace): Promise<Workspace> {
  const expanded = expandHome(stored.path);
  if (!isDirectory(expanded)) throw new Error("path is not a directory");
  const path = realpathSync(expanded);
  const { origin, worktrees } = await gitMetadata(path);
  return { ...stored, path, origin, worktrees };
}

async function computeWorkspaces(): Promise<Workspace[]> {
  const stored = load();
  const resolved = await Promise.all(stored.map(async (workspace) => {
    try {
      const hydrated = await hydrateWorkspace(workspace);
      return { workspace: hydrated, migrated: workspace.path !== hydrated.path };
    } catch {
      return null;
    }
  }));
  const migrated = resolved.flatMap((item) => item ? [item.workspace] : []);
  if (resolved.some((item) => item?.migrated)) {
    const byID = new Map(migrated.map(({ id, name, path, icon, tint }) => [id, { id, name, path, icon, tint }]));
    save(stored.map((workspace) => byID.get(workspace.id) ?? workspace));
  }
  return migrated;
}

export async function addWorkspace(name: string, rawPath: string): Promise<Workspace> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("workspace name required");
  const workspace = await hydrateWorkspace({ id: randomUUID(), name: trimmedName, path: rawPath, icon: null, tint: null });
  const workspaces = load();
  const existing = workspaces.find((entry) => entry.path === workspace.path);
  if (existing) {
    existing.name = trimmedName;
    existing.path = workspace.path;
    save(workspaces);
    invalidateWorkspacesCache();
    return { ...existing, origin: workspace.origin, worktrees: workspace.worktrees };
  }
  workspaces.push({ id: workspace.id, name: workspace.name, path: workspace.path, icon: workspace.icon, tint: workspace.tint });
  save(workspaces);
  invalidateWorkspacesCache();
  return workspace;
}

export async function updateWorkspace(
  id: string,
  patch: { name?: string; icon?: string | null; tint?: string | null },
): Promise<Workspace> {
  const stored = load();
  const entry = stored.find((workspace) => workspace.id === id);
  if (!entry) throw new Error("workspace not found");
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("workspace name required");
    entry.name = name;
  }
  if (patch.icon !== undefined) {
    entry.icon = normalizeWorkspaceIcon(patch.icon);
  }
  if (patch.tint !== undefined) {
    entry.tint = normalizeWorkspaceTint(patch.tint);
  }
  save(stored);
  invalidateWorkspacesCache();
  return hydrateWorkspace(entry);
}

function normalizeWorkspaceIcon(icon: string | null): string | null {
  const trimmed = icon?.trim() ?? "";
  if (!trimmed || trimmed === "folder") return null;
  const file = normalizeWorkspaceIconFile(trimmed);
  if (file) return file;
  if (!/^[a-z0-9-]{1,32}$/.test(trimmed)) return null;
  return trimmed;
}

const WORKSPACE_ICON_FILE = /\.(png|jpe?g|svg|webp)$/i;
const MAX_ICON_FILE_BYTES = 512 * 1024;
const ICON_SUGGESTION_LIMIT = 32;

function normalizeWorkspaceIconFile(icon: string): string | null {
  const posix = icon.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!WORKSPACE_ICON_FILE.test(posix)) return null;
  if (!posix || posix.length > 240 || posix.includes("..") || posix.startsWith("/") || posix.includes("\0")) {
    return null;
  }
  return posix;
}

export interface WorkspaceIconMatch {
  path: string;
  name: string;
  preview?: string;
}

export async function suggestWorkspaceIcons(id: string, query: string): Promise<WorkspaceIconMatch[]> {
  const workspace = await workspaceByID(id);
  const files = await findProjectFiles(workspace.path, query, { match: (path) => WORKSPACE_ICON_FILE.test(path) });
  const ranked = query.trim()
    ? files
    : [...files].sort(
        (a, b) => iconNameBoost(b.path) - iconNameBoost(a.path) || a.path.length - b.path.length || a.path.localeCompare(b.path),
      );

  return ranked.slice(0, ICON_SUGGESTION_LIMIT).map((file) => {
    const preview = previewWorkspaceImage(workspace.path, file.path);
    return { path: file.path, name: basename(file.path), ...(preview ? { preview } : {}) };
  });
}

function iconNameBoost(path: string): number {
  const name = basename(path).toLowerCase();
  if (/^(appicon|ic_launcher|icon|logo|favicon|mark)(\.|-|_)/.test(name) || /^(icon|logo|favicon|mark)\./.test(name)) {
    return 50;
  }
  if (/icon|logo|mark|favicon|launcher/.test(name)) return 20;
  return 0;
}

export async function readWorkspaceImage(id: string, rel: string): Promise<{ mime: string; data: string }> {
  const workspace = await workspaceByID(id);
  const preview = previewWorkspaceImage(workspace.path, rel, MAX_ICON_FILE_BYTES);
  if (!preview) throw new Error("file not found");
  const comma = preview.indexOf(",");
  const header = preview.slice(5, preview.indexOf(";"));
  return { mime: header, data: preview.slice(comma + 1) };
}

function previewWorkspaceImage(root: string, rel: string, maxBytes = 64 * 1024): string | undefined {
  const file = normalizeWorkspaceIconFile(rel);
  if (!file) return undefined;
  try {
    const resolved = resolveInside(root, file);
    const stat = statSync(resolved);
    if (!stat.isFile() || stat.size === 0 || stat.size > maxBytes) return undefined;
    const mime = mimeForIcon(file);
    if (!mime) return undefined;
    return `data:${mime};base64,${readFileSync(resolved).toString("base64")}`;
  } catch {
    return undefined;
  }
}

function resolveInside(root: string, rel: string): string {
  const base = realpathSync(root);
  const resolved = realpathSync(join(base, rel));
  const fromRoot = relative(base, resolved);
  if (!fromRoot || fromRoot.startsWith("..") || isAbsolute(fromRoot)) throw new Error("path outside workspace");
  return resolved;
}

function mimeForIcon(path: string): string | undefined {
  const ext = path.slice(path.lastIndexOf(".")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".svg") return "image/svg+xml";
  if (ext === ".webp") return "image/webp";
  return undefined;
}

function normalizeWorkspaceTint(tint: string | null): string | null {
  const trimmed = tint?.trim() ?? "";
  if (!trimmed || trimmed === "zinc") return null;
  if (!/^[a-z0-9-]{1,32}$/.test(trimmed)) return null;
  return trimmed;
}

export interface PathSuggestion {
  path: string;
  name: string;
  repo: boolean;
}

const PATH_SUGGESTION_LIMIT = 16;
const PATH_SEED_NAMES = ["Documents", "Desktop", "Downloads", "code", "src", "Projects", "Developer", "work"];
const SKIP_PATH_NAMES = new Set([
  ".git",
  ".build",
  ".next",
  ".swiftpm",
  ".cache",
  ".npm",
  ".local",
  ".trash",
  "build",
  "deriveddata",
  "dist",
  "node_modules",
  "pods",
  "vendor",
  "library",
  "applications",
  "system",
  "volumes",
]);

/// Directory autocomplete for the add-workspace picker. One level at a time:
/// type a prefix, pick a folder, keep going. Git checkouts sort first.
export function suggestWorkspacePaths(query: string): PathSuggestion[] {
  try {
    const trimmed = query.trim();
    const home = homedir();
    if (!trimmed || trimmed === "~") return seedPathSuggestions(home);

    const slash = /[\\/]$/.test(trimmed);
    const expanded = expandHome(trimmed);
    const dir = slash ? expanded : dirname(expanded);
    const prefix = slash ? "" : basename(expanded);
    if (!isDirectory(dir)) return [];

    const results: PathSuggestion[] = [];
    const seen = new Set<string>();
    const push = (path: string, name: string) => {
      if (seen.has(path) || results.length >= PATH_SUGGESTION_LIMIT) return;
      seen.add(path);
      results.push({ path, name, repo: isGitCheckout(path) });
    };

    if (!slash && isDirectory(expanded)) {
      push(expanded, basename(expanded) || expanded);
    }

    const allowHidden = prefix.startsWith(".");
    const needle = prefix.toLowerCase();
    const entries = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) return false;
        if (!allowHidden && entry.name.startsWith(".")) return false;
        if (SKIP_PATH_NAMES.has(entry.name.toLowerCase())) return false;
        if (needle && !entry.name.toLowerCase().startsWith(needle)) return false;
        return isDirectory(join(dir, entry.name));
      })
      .sort((a, b) => {
        const aPath = join(dir, a.name);
        const bPath = join(dir, b.name);
        return Number(isGitCheckout(bPath)) - Number(isGitCheckout(aPath)) || a.name.localeCompare(b.name);
      });

    for (const entry of entries) push(join(dir, entry.name), entry.name);
    return results;
  } catch {
    return [];
  }
}

function seedPathSuggestions(home: string): PathSuggestion[] {
  const results: PathSuggestion[] = [];
  const seen = new Set<string>();
  const push = (path: string, name: string) => {
    if (seen.has(path) || !isDirectory(path) || results.length >= PATH_SUGGESTION_LIMIT) return;
    seen.add(path);
    results.push({ path, name, repo: isGitCheckout(path) });
  };

  push(home, "~");
  for (const name of PATH_SEED_NAMES) push(join(home, name), name);

  try {
    for (const entry of readdirSync(home, { withFileTypes: true })) {
      if (results.length >= PATH_SUGGESTION_LIMIT) break;
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      if (SKIP_PATH_NAMES.has(entry.name.toLowerCase())) continue;
      const path = join(home, entry.name);
      if (isDirectory(path) && isGitCheckout(path)) push(path, entry.name);
    }
  } catch {
    // Listing home can fail on locked accounts; seeds above still stand.
  }

  results.sort((a, b) => Number(b.repo) - Number(a.repo) || a.name.localeCompare(b.name));
  return results;
}

export function removeWorkspace(id: string): void {
  save(load().filter((workspace) => workspace.id !== id));
  invalidateWorkspacesCache();
}

async function workspaceByID(id: string): Promise<Workspace> {
  const stored = load().find((workspace) => workspace.id === id);
  if (!stored) throw new Error("workspace not found");
  const workspace = await hydrateWorkspace(stored);
  if (stored.path !== workspace.path) {
    save(load().map((entry) => (entry.id === id ? { id, name: stored.name, path: workspace.path, icon: stored.icon, tint: stored.tint } : entry)));
  }
  return workspace;
}

// Opens a plain shell tmux session at the primary checkout, auto-named from
// the workspace so tapping "+" is one action with no prompt.
export async function openSessionInWorkspace(id: string): Promise<string> {
  const workspace = await workspaceByID(id);
  const base = (workspace.name.replace(/[^A-Za-z0-9_-]/g, "-").replace(/^[^A-Za-z0-9_]+/, "") || "ws").slice(0, 24);
  const name = `${base}-${randomUUID().slice(0, 4)}`;
  assertValidName(name);
  await exec("tmux", ["new-session", "-d", "-s", name, "-c", workspace.path]);
  return name;
}

async function managedWorktreePath(workspacePath: string, branch: string): Promise<string> {
  const { stdout } = await exec("git", ["-C", workspacePath, "rev-parse", "--git-path", "info/exclude"], { cwd: homedir() });
  const rawExcludePath = stdout.trim();
  const excludePath = isAbsolute(rawExcludePath) ? rawExcludePath : resolve(workspacePath, rawExcludePath);
  const ignoreRule = "/.claude/worktrees/";
  const existing = existsSync(excludePath) ? readFileSync(excludePath, "utf8") : "";
  if (!existing.split("\n").some((line) => line.trim() === ignoreRule)) {
    const separator = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
    writeFileSync(excludePath, `${existing}${separator}${ignoreRule}\n`);
  }

  const path = join(workspacePath, ".claude", "worktrees", branch);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}

export function isLegacyManagedWorktreePath(workspacePath: string, worktreePath: string): boolean {
  const legacyRoot = join(dirname(workspacePath), `${basename(workspacePath)}-worktrees`);
  const pathFromLegacyRoot = relative(legacyRoot, worktreePath);
  return pathFromLegacyRoot.length > 0 && !pathFromLegacyRoot.startsWith("..") && !isAbsolute(pathFromLegacyRoot);
}

// Opens a PR-aware shell. Reuse the branch's linked worktree when it already
// exists; otherwise materialize the exact GitHub PR head into a new worktree
// before starting tmux. The primary checkout is never repurposed or switched.
export async function openPullRequestSession(id: string, branchValue: string, pullRequestNumber: number): Promise<string> {
  const workspace = await workspaceByID(id);
  const branch = branchValue.trim();
  if (!Number.isSafeInteger(pullRequestNumber) || pullRequestNumber <= 0) throw new Error("invalid pull request number");
  if (!branch) throw new Error("pull request branch is required");
  await exec("git", ["check-ref-format", "--branch", branch], { cwd: homedir() });

  let path = workspace.worktrees.find((worktree) => worktree.branch === branch)?.path;
  if (path && isLegacyManagedWorktreePath(workspace.path, path)) {
    const legacyPath = path;
    const destination = await managedWorktreePath(workspace.path, branch);
    if (existsSync(destination)) throw new Error(`managed worktree path already exists: ${destination}`);
    await exec(
      "git",
      ["-C", workspace.path, "worktree", "move", legacyPath, destination],
      { cwd: homedir(), timeout: 60_000 },
    );
    path = destination;
    invalidateWorkspacesCache();
  }
  if (!path) {
    path = await managedWorktreePath(workspace.path, branch);
    if (existsSync(path)) throw new Error(`managed worktree path already exists: ${path}`);

    let hasLocalBranch = true;
    try {
      await exec("git", ["-C", workspace.path, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: homedir() });
    } catch {
      hasLocalBranch = false;
    }

    if (hasLocalBranch) {
      await exec("git", ["-C", workspace.path, "worktree", "add", path, branch], { cwd: homedir(), timeout: 60_000 });
    } else {
      const pullRef = `refs/remotes/remy/pr-${pullRequestNumber}`;
      await exec(
        "git",
        ["-C", workspace.path, "fetch", "origin", `pull/${pullRequestNumber}/head:${pullRef}`],
        { cwd: homedir(), timeout: 60_000 },
      );
      await exec(
        "git",
        ["-C", workspace.path, "worktree", "add", "-b", branch, path, pullRef],
        { cwd: homedir(), timeout: 60_000 },
      );
    }
    invalidateWorkspacesCache();
  }

  const name = `pr-${pullRequestNumber}-${randomUUID().slice(0, 4)}`;
  assertValidName(name);
  await newShellSession({ name, path, agent: "shell" });
  return name;
}

// Starts a whole new task: a fresh branch + linked worktree + tmux session with
// the selected agent, and the task delivered as its first message. The agent is
// a fixed executable; the prompt is delivered through injection-safe bracketed
// paste, never as part of a shell command.
export async function createTaskSession(id: string, prompt: string, agent: Exclude<AgentKind, "shell">): Promise<string> {
  const workspace = await workspaceByID(id);
  // Resolve the executable before creating a branch or worktree. A launchd
  // service often cannot see user-local installs such as ~/.local/bin/claude.
  agentCommand(agent);
  const trimmed = prompt.trim();
  const slug =
    (trimmed || "task")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24)
      .replace(/-+$/g, "") || "task";
  const suffix = randomUUID().slice(0, 4);
  const branch = `mc/${slug}-${suffix}`;
  const worktreePath = await managedWorktreePath(workspace.path, branch);
  if (existsSync(worktreePath)) throw new Error(`managed worktree path already exists: ${worktreePath}`);
  await exec("git", ["-C", workspace.path, "worktree", "add", "-b", branch, worktreePath]);
  invalidateWorkspacesCache();

  const name = `${slug}-${suffix}`;
  assertValidName(name);
  await newShellSession({ name, path: worktreePath, agent });
  if (trimmed) {
    // Delivery is part of the request: wait for the real composer instead of
    // racing startup with a timer and silently discarding paste failures.
    await waitForAgentComposer(name, agent);
    await sendText(name, trimmed, true);
  }
  return name;
}

function containsPath(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root + "/");
}

async function closeWorktrees(workspace: Workspace, paths: string[], force: boolean): Promise<{ closedPaths: string[]; killedSessions: string[] }> {
  const targets = workspace.worktrees.filter((worktree) => paths.includes(worktree.path));
  if (targets.length !== paths.length || targets.some((worktree) => worktree.isMain)) {
    throw new Error("refusing to remove an unregistered or primary worktree");
  }
  if (!force) {
    // Recompute dirty fresh (listing no longer carries it) so clean close can
    // never discard uncommitted work.
    const dirty: GitWorktree[] = [];
    for (const target of targets) {
      if (await worktreeDirty(target.path)) dirty.push(target);
    }
    if (dirty.length) throw new Error(`worktree has uncommitted changes: ${dirty.map((worktree) => worktree.branch ?? worktree.path).join(", ")}`);
  }

  // Stop any sessions rooted in the worktree before Git removes its directory.
  // This makes close deterministic instead of leaving tmux processes stranded
  // in a deleted working directory.
  const sessions = await listSessions();
  const sessionsToKill = sessions.filter((session) => targets.some((worktree) => containsPath(worktree.path, session.panePath)));
  await Promise.all(sessionsToKill.map((session) => killSession(session.name)));

  const closedPaths: string[] = [];
  for (const target of targets) {
    const args = ["-C", workspace.path, "worktree", "remove"];
    if (force) args.push("--force");
    args.push(target.path);
    await exec("git", args);
    closedPaths.push(target.path);
  }
  invalidateWorkspacesCache();
  return { closedPaths, killedSessions: sessionsToKill.map((session) => session.name) };
}

export async function closeWorkspaceWorktree(id: string, path: string, force: boolean) {
  const workspace = await workspaceByID(id);
  return closeWorktrees(workspace, [path], force);
}

export async function closeAllWorkspaceWorktrees(id: string, force: boolean) {
  const workspace = await workspaceByID(id);
  return closeWorktrees(
    workspace,
    workspace.worktrees.filter((worktree) => !worktree.isMain).map((worktree) => worktree.path),
    force,
  );
}

// On-demand dirty state for every worktree of a workspace, for the repository
// sheet. Kept out of the fleet-poll listing because `git status` is slow on big
// repos and external drives.
export async function worktreeDirtyMap(id: string): Promise<Record<string, boolean>> {
  const workspace = await workspaceByID(id);
  const entries = await Promise.all(
    workspace.worktrees.map(async (worktree) => [worktree.path, await worktreeDirty(worktree.path)] as const),
  );
  return Object.fromEntries(entries);
}
