import { Box, Code, Database, Folder, GitBranch, Globe, Sparkles, Terminal, type LucideIcon } from "lucide-react-native";

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
