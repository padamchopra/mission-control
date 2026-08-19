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
  /// When the current run of work began. Absent once the chat settles, so a
  /// row only shows a clock while there is something to time.
  workingSince?: number;
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

/// One rendered item in a chat's feed. `kind` picks the renderer; the rest are
/// populated per kind. Mirrors `ConvEntry` in `server/src/transcript.ts`.
export interface ConvEntry {
  id: string;
  kind: "user" | "assistant" | "thinking" | "tool";
  text?: string;
  tool?: string;
  verb?: string;
  arg?: string;
  status?: "ok" | "error";
  output?: string;
  file?: string;
  skill?: string;
  diff?: ConvDiffLine[];
  adds?: number;
  dels?: number;
  questions?: ConvQuestion[];
}

export interface ConvDiffLine {
  kind: "add" | "del" | "ctx";
  text: string;
}

export interface ConvQuestion {
  header?: string;
  question: string;
  multiSelect?: boolean;
  options: ConvQuestionOption[];
  answer?: string;
  notes?: string;
}

export interface ConvQuestionOption {
  label: string;
  description?: string;
  preview?: string;
  selected?: boolean;
}

export interface ConvTodo {
  content: string;
  status: string;
}

/// A tool call the chat is blocked on, waiting for you to allow or deny it.
export interface ChatApproval {
  requestId: string;
  tool: string;
  verb: string;
  arg: string;
  title?: string;
  reason?: string;
  file?: string;
  diff?: ConvDiffLine[];
  plan?: string;
  allowAlways: boolean;
}

export interface ChatQuestionRequest {
  requestId: string;
  questions: ConvQuestion[];
}

/// One open chat, as `GET /chats/:id` returns it plus the server it came from.
export interface ChatDetail {
  id: string;
  serverId: string;
  title: string;
  cwd: string;
  model?: string;
  state: ChatState;
  action?: string;
  entries: ConvEntry[];
  todos: ConvTodo[];
  approval?: ChatApproval;
  question?: ChatQuestionRequest;
  /// True while the chat holds a live Claude process. A cold chat resumes on
  /// the next message, so this is a hint, not a blocker.
  live?: boolean;
  error?: string;
}

/// Settings that belong to a machine rather than a device or a chat. They live
/// in that server's `remy.db`, so every client attached to it sees the same
/// values. Mirrors `PublicSettings` in `server/src/config.ts`.
export interface ServerSettings {
  preventSleep: "off" | "whileBusy" | "always";
  defaultCheckout: "main" | "worktree";
  worktreeBase: "remote" | "local";
  worktreeRoot: string;
  defaultModel: string;
  /// What Remy runs its own small jobs on, as opposed to what your chats think
  /// with. Kept cheap on purpose.
  remyModel: string;
  repoUpdate: "off" | "hourly" | "sixHourly" | "daily";
}

/// What one repository did the last time Remy refreshed them.
export interface RepoOutcome {
  workspace: string;
  path: string;
  result: "updated" | "current" | "dirty" | "no-upstream" | "diverged" | "detached" | "failed";
  detail?: string;
}

export interface UpdateRun {
  at: number;
  repos: RepoOutcome[];
}

/// What a command-line tool on the machine reports about itself.
export interface ToolStatus {
  available: boolean;
  version?: string;
  authenticated?: boolean;
  account?: string;
  error?: string;
}

export interface Tooling {
  git: ToolStatus;
  gh: ToolStatus;
  claude: ToolStatus;
}
