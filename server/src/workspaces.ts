import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";
import { join } from "node:path";
import { configDir } from "./config.js";
import { assertValidName } from "./tmux.js";

const exec = promisify(execFile);
const workspacesFile = join(configDir, "workspaces.json");

export interface Workspace {
  id: string;
  name: string;
  path: string;
}

function load(): Workspace[] {
  if (!existsSync(workspacesFile)) return [];
  try {
    const parsed = JSON.parse(readFileSync(workspacesFile, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(workspaces: Workspace[]): void {
  writeFileSync(workspacesFile, JSON.stringify(workspaces, null, 2) + "\n");
}

export function listWorkspaces(): Workspace[] {
  return load();
}

export function addWorkspace(name: string, path: string): Workspace {
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error("workspace name required");
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error("path is not a directory");
  const workspaces = load();
  const existing = workspaces.find((w) => w.path === path);
  if (existing) {
    existing.name = trimmedName;
    save(workspaces);
    return existing;
  }
  const workspace: Workspace = { id: randomUUID(), name: trimmedName, path };
  workspaces.push(workspace);
  save(workspaces);
  return workspace;
}

export function removeWorkspace(id: string): void {
  save(load().filter((w) => w.id !== id));
}

// Opens a plain shell tmux session in the workspace path, auto-named from the
// workspace so tapping "+" is one action with no prompt.
export async function openSessionInWorkspace(id: string): Promise<string> {
  const workspace = load().find((w) => w.id === id);
  if (!workspace) throw new Error("workspace not found");
  const base = (workspace.name.replace(/[^A-Za-z0-9_-]/g, "-").replace(/^[^A-Za-z0-9_]+/, "") || "ws").slice(0, 24);
  const name = `${base}-${randomUUID().slice(0, 4)}`;
  assertValidName(name);
  await exec("tmux", ["new-session", "-d", "-s", name, "-c", workspace.path]);
  return name;
}
