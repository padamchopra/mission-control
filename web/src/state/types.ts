import type { DeviceIconId } from "~/lib/devices";
import type { TintId } from "~/lib/tints";

/// Shapes mirroring what `server/src` already returns. Kept deliberately narrow:
/// only the fields the desktop UI reads, so a server change that adds a field
/// doesn't ripple through here.

export type ChatState = "idle" | "working" | "needs_input" | "error";

export interface Server {
  id: string;
  name: string;
  url: string;
  code: string;
  online: boolean;
  icon: DeviceIconId;
  tint?: TintId;
  /// This machine's own daemon, started with the app. It cannot be unpaired.
  local?: boolean;
}

export interface Chat {
  id: string;
  serverId: string;
  title: string;
  cwd: string;
  state: ChatState;
  model?: string;
  preview?: string;
  updatedAt: number;
}

export interface GitWorktree {
  path: string;
  branch: string | null;
  isMain: boolean;
  dirty: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
  checkout: "main" | "worktree" | null;
}

export interface Workspace {
  id: string;
  serverId: string;
  name: string;
  path: string;
  origin?: string | null;
  icon?: string | null;
  tint?: string | null;
  worktrees: GitWorktree[];
}

export interface PathSuggestion {
  path: string;
  name: string;
  repo: boolean;
}

export interface WorkspaceIconMatch {
  path: string;
  name: string;
  preview?: string;
}
