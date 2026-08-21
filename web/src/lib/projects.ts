import {
  Box,
  Code,
  Database,
  Folder,
  GitBranch,
  Globe,
  Sparkles,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import type { Server, Workspace } from "@/state/types";

/// Icons a workspace can wear in the list and in project settings.
export const PROJECT_ICONS = {
  folder: Folder,
  code: Code,
  terminal: Terminal,
  git: GitBranch,
  globe: Globe,
  database: Database,
  box: Box,
  sparkles: Sparkles,
} as const;

export type ProjectIconId = keyof typeof PROJECT_ICONS;

export const PROJECT_ICON_IDS = Object.keys(PROJECT_ICONS) as ProjectIconId[];

export function isProjectIcon(value: unknown): value is ProjectIconId {
  return typeof value === "string" && value in PROJECT_ICONS;
}

const PROJECT_ICON_FILE = /\.(png|jpe?g|svg|webp)$/i;

export function isProjectIconFile(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ICON_FILE.test(value) && !value.includes("..");
}

export function projectIcon(id: ProjectIconId | string | null | undefined): LucideIcon {
  return PROJECT_ICONS[id && isProjectIcon(id) ? id : "folder"];
}

/// The machines that hold the same repository as this workspace. A folder
/// without a git origin has no cross-device identity, so it stays on the one
/// machine where it was added rather than matching another folder by name.
export function devicesForWorkspace(workspace: Workspace, all: Workspace[], servers: Server[]): Server[] {
  const related = all.filter((entry) =>
    entry.id === workspace.id || (workspace.origin ? entry.origin === workspace.origin : false),
  );
  const ids = [...new Set(related.map((entry) => entry.serverId))];
  return ids.flatMap((id) => {
    const server = servers.find((entry) => entry.id === id);
    return server ? [server] : [];
  });
}

/// Where a project is checked out on this machine, if it is at all. A project
/// spans devices; a workspace is one device's copy of it, so this is empty on a
/// machine that has not cloned the repo.
export function localWorkspace<W extends { id: string }>(
  project: { workspaceIds: string[] },
  workspaces: W[],
): W | undefined {
  return workspaces.find((workspace) => project.workspaceIds.includes(workspace.id));
}

/// The workspace a path belongs to. A chat runs in a checkout — the primary one
/// or one of its worktrees — so every known path is considered and the longest
/// match wins, which keeps a worktree from being read as its parent repo.
export function workspaceForPath(
  path: string,
  workspaces: { path: string; worktrees: { path: string }[] }[],
): number {
  let best = -1;
  let bestLength = 0;
  workspaces.forEach((workspace, index) => {
    for (const candidate of [workspace.path, ...workspace.worktrees.map((tree) => tree.path)]) {
      if (!candidate || candidate.length <= bestLength) continue;
      if (path !== candidate && !path.startsWith(`${candidate}/`)) continue;
      best = index;
      bestLength = candidate.length;
    }
  });
  return best;
}
