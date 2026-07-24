import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { promisify } from "node:util";
import { configDir } from "./config.js";
import { assertValidName, killSession, listSessions, sendText } from "./tmux.js";

const exec = promisify(execFile);
const workspacesFile = join(configDir, "workspaces.json");

/** A workspace is a Git repository's primary checkout, never an arbitrary folder. */
export interface Workspace {
  id: string;
  name: string;
  /** The repository's primary (main) checkout, used for new sessions. */
  path: string;
  /** Display form of the `origin` remote (host/owner/repo), if any. */
  origin: string | null;
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
}

interface ParsedWorktree {
  path: string;
  branch: string | null;
}

function load(): StoredWorkspace[] {
  if (!existsSync(workspacesFile)) return [];
  try {
    const parsed = JSON.parse(readFileSync(workspacesFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(workspaces: StoredWorkspace[]): void {
  writeFileSync(workspacesFile, JSON.stringify(workspaces, null, 2) + "\n");
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

async function repositoryForPath(rawPath: string): Promise<{ mainPath: string; origin: string | null; worktrees: GitWorktree[] }> {
  if (!existsSync(rawPath) || !statSync(rawPath).isDirectory()) throw new Error("path is not a directory");
  const path = realpathSync(rawPath);
  let porcelain: string;
  try {
    ({ stdout: porcelain } = await exec("git", ["-C", path, "worktree", "list", "--porcelain"]));
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
  const worktrees = await Promise.all(entries.map(async (entry, index) => {
    let dirty = false;
    try {
      const { stdout } = await exec("git", ["-C", entry.path, "status", "--porcelain"]);
      dirty = stdout.trim().length > 0;
    } catch {
      // A prunable/missing worktree stays visible so Git can report its state;
      // we never assume it is safe to force-delete.
      dirty = true;
    }
    return { path: entry.path, branch: entry.branch, isMain: index === 0, dirty };
  }));
  let origin: string | null = null;
  try {
    const { stdout } = await exec("git", ["-C", path, "remote", "get-url", "origin"]);
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

/**
 * Resolve every stored repository on read. This also upgrades old directory
 * workspaces to the repository primary checkout. Non-repository legacy entries
 * remain in the JSON file but are not returned: a workspace now has a precise
 * Git meaning rather than silently grouping arbitrary folders.
 */
export async function listWorkspaces(): Promise<Workspace[]> {
  const stored = load();
  const resolved = await Promise.all(stored.map(async (workspace) => {
    try {
      const repository = await repositoryForPath(workspace.path);
      return {
        workspace: { ...workspace, path: repository.mainPath, origin: repository.origin, worktrees: repository.worktrees },
        migrated: workspace.path !== repository.mainPath,
      };
    } catch {
      return null;
    }
  }));
  const migrated = resolved.flatMap((item) => item ? [item.workspace] : []);
  if (resolved.some((item) => item?.migrated)) {
    const byID = new Map(migrated.map(({ id, name, path }) => [id, { id, name, path }]));
    save(stored.map((workspace) => byID.get(workspace.id) ?? workspace));
  }
  return migrated;
}

export async function addWorkspace(name: string, rawPath: string): Promise<Workspace> {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("workspace name required");
  const repository = await repositoryForPath(rawPath);
  const workspaces = load();
  // A previous version stored the directory the user selected, which may have
  // been a linked worktree. Resolve stored entries too so re-saving that repo
  // upgrades the existing workspace rather than creating a duplicate.
  const existing = (await Promise.all(workspaces.map(async (workspace) => {
    try {
      return (await repositoryForPath(workspace.path)).mainPath === repository.mainPath ? workspace : null;
    } catch {
      return null;
    }
  }))).find((workspace): workspace is StoredWorkspace => workspace !== null);
  if (existing) {
    existing.name = trimmedName;
    existing.path = repository.mainPath;
    save(workspaces);
    return { ...existing, path: repository.mainPath, origin: repository.origin, worktrees: repository.worktrees };
  }
  const workspace: StoredWorkspace = { id: randomUUID(), name: trimmedName, path: repository.mainPath };
  workspaces.push(workspace);
  save(workspaces);
  return { ...workspace, origin: repository.origin, worktrees: repository.worktrees };
}

export function removeWorkspace(id: string): void {
  save(load().filter((workspace) => workspace.id !== id));
}

async function workspaceByID(id: string): Promise<Workspace> {
  const stored = load().find((workspace) => workspace.id === id);
  if (!stored) throw new Error("workspace not found");
  const repository = await repositoryForPath(stored.path);
  if (stored.path !== repository.mainPath) {
    stored.path = repository.mainPath;
    const all = load().map((workspace) => workspace.id === id ? stored : workspace);
    save(all);
  }
  return { ...stored, path: repository.mainPath, origin: repository.origin, worktrees: repository.worktrees };
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

// Starts a whole new task: a fresh branch + linked worktree + tmux session with
// Claude launched, and the task delivered as Claude's first message. Claude is
// launched via a fixed argv ("claude"); the prompt is only ever delivered
// through injection-safe bracketed paste, never as part of a shell command.
export async function createTaskSession(id: string, prompt: string): Promise<string> {
  const workspace = await workspaceByID(id);
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
  const worktreeParent = join(dirname(workspace.path), `${basename(workspace.path)}-worktrees`);
  const worktreePath = join(worktreeParent, `${slug}-${suffix}`);
  mkdirSync(worktreeParent, { recursive: true });
  await exec("git", ["-C", workspace.path, "worktree", "add", "-b", branch, worktreePath]);

  const name = `${slug}-${suffix}`;
  assertValidName(name);
  await exec("tmux", ["new-session", "-d", "-s", name, "-c", worktreePath, "claude"]);
  if (trimmed) {
    // Give Claude a moment to start, then hand it the task through bracketed paste.
    setTimeout(() => {
      sendText(name, trimmed, true).catch(() => {});
    }, 2500);
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
    const dirty = targets.filter((worktree) => worktree.dirty);
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
