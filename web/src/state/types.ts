/// Shapes mirroring what `server/src` already returns. Kept deliberately narrow:
/// only the fields the desktop UI reads, so a server change that adds a field
/// doesn't ripple through here.

export type SessionState = "working" | "needs_input" | "idle" | "unknown";
export type ChatState = "idle" | "working" | "needs_input" | "error";

export interface Server {
  id: string;
  name: string;
  url: string;
  code: string;
  online: boolean;
}

export interface Session {
  name: string;
  serverId: string;
  state: SessionState;
  path: string;
  command: string;
  agent: string;
  preview?: string;
  workspace?: string;
  lastOutputAt: number;
}

export interface Chat {
  id: string;
  title: string;
  cwd: string;
  state: ChatState;
  model?: string;
  preview?: string;
  updatedAt: number;
}
