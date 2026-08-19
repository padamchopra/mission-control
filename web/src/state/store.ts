import { create } from "zustand";
import { codeFor, type DeviceIconId } from "~/lib/devices";
import type { TintId } from "~/lib/tints";
import { transport } from "~/lib/transport";
import { fixtureChats, fixtureServers, fixtureWorkspaces } from "./fixture";
import type {
  Chat,
  ChatApproval,
  ChatDetail,
  ChatQuestionRequest,
  ChatState,
  ConvEntry,
  ConvTodo,
  GitBranch,
  GitWorktree,
  PathSuggestion,
  Server,
  Workspace,
  WorkspaceIconMatch,
} from "./types";

/// The client's whole view of every connected server.
///
/// Pushes patch what is already here rather than triggering a refetch, so a
/// chat changing state costs no requests. `/notify/stream` sends `chats` when
/// the list changed, which is the one case that needs a fetch.
///
/// A poll runs underneath the push channel. The interval is loose while the
/// socket is up, because then it is only covering missed frames, and tight
/// while it is down, because then it is the only source of truth.

const useFixture = import.meta.env.VITE_MC_FIXTURE === "1";

interface RawChat {
  id: string;
  title: string;
  cwd: string;
  state?: ChatState;
  model?: string;
  preview?: string;
  updatedAt?: number;
}

interface RawWorkspace {
  id: string;
  name: string;
  path: string;
  origin?: string | null;
  icon?: string | null;
  tint?: string | null;
  worktrees?: GitWorktree[];
}

interface State {
  servers: Server[];
  chats: Chat[];
  workspaces: Workspace[];
  /// The chat the main pane has open. Held here rather than in the component so
  /// a push can patch it without the view refetching.
  openId?: string;
  detail?: ChatDetail;
  detailLoading: boolean;
  loading: boolean;
  /// Set when every configured server failed, so the UI can say why rather than
  /// showing an empty list as though nothing were running.
  error?: string;
  connected: boolean;

  start(): () => void;
  refresh(): Promise<void>;
  addServer(input: { url: string; token: string; name?: string }): Promise<void>;
  removeServer(id: string): Promise<void>;
  updateServer(id: string, patch: { name?: string; icon?: DeviceIconId; tint?: TintId }): Promise<void>;
  addWorkspace(input: { path: string; name?: string }): Promise<void>;
  updateWorkspace(id: string, patch: { name?: string; icon?: string | null; tint?: string | null }): Promise<void>;
  removeWorkspace(id: string): Promise<void>;
  suggestPaths(query: string): Promise<PathSuggestion[]>;
  suggestWorkspaceIcons(id: string, query: string): Promise<WorkspaceIconMatch[]>;
  workspaceFile(id: string, path: string): Promise<{ mime: string; data: string } | undefined>;
  listBranches(workspaceId: string): Promise<GitBranch[]>;
  checkoutBranch(input: {
    workspaceId: string;
    branch: string;
    mode: "main" | "worktree";
  }): Promise<{ path: string }>;
  createChat(input: {
    cwd: string;
    text: string;
    serverId?: string;
    model?: string;
    permissionMode?: string;
  }): Promise<{ id: string; serverId: string }>;
  openChat(id: string): Promise<void>;
  closeChat(): void;
  sendMessage(text: string): Promise<void>;
  answerApproval(requestId: string, decision: "allow" | "allowAlways" | "deny"): Promise<void>;
  answerQuestion(requestId: string, answers: Record<string, unknown>): Promise<void>;
  interrupt(): Promise<void>;
}

/// How often to poll. Long while pushes are arriving, short while they aren't.
const POLL_CONNECTED_MS = 15_000;
const POLL_DISCONNECTED_MS = 4_000;

export const useStore = create<State>((set, get) => ({
  servers: useFixture ? fixtureServers : [],
  chats: useFixture ? fixtureChats : [],
  workspaces: useFixture ? fixtureWorkspaces : [],
  detailLoading: false,
  loading: !useFixture,
  connected: useFixture,

  start() {
    if (useFixture) return () => {};

    void get().refresh();

    const offPush = transport.subscribe((_serverId, payload) => {
      const frame = payload as ChatFrame;
      if (frame.type === "chats") {
        void get().refresh();
        return;
      }
      // A turn streams as `chat` frames: the entries that changed, plus the
      // whole scalar state. Patch what is on screen rather than refetching.
      if (frame.type === "chat" && frame.chatId) set((current) => applyChatFrame(current, frame));
    });

    const offStatus = transport.onStatus((serverId, pushUp) => {
      // The notify socket is a live-update channel, not reachability. In the
      // preview tunnel it flaps constantly; treating that as "device offline"
      // made a healthy local server look disconnected.
      set((current) => ({
        connected: pushUp || current.servers.some((server) => server.id !== serverId && server.online),
        servers: pushUp
          ? current.servers.map((server) => (server.id === serverId ? { ...server, online: true } : server))
          : current.servers,
      }));
    });

    // Re-armed after each run rather than a fixed interval, so a slow refresh
    // cannot stack requests on a struggling server.
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const poll = async () => {
      if (stopped) return;
      await get().refresh();
      if (stopped) return;
      timer = setTimeout(
        () => void poll(),
        get().connected ? POLL_CONNECTED_MS : POLL_DISCONNECTED_MS,
      );
    };
    timer = setTimeout(() => void poll(), POLL_CONNECTED_MS);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      offPush();
      offStatus();
    };
  },

  async refresh() {
    if (useFixture) return;
    if (get().servers.length === 0) set({ loading: true });

    const servers = await transport.servers();
    if (servers.length === 0) {
      set({ servers: [], chats: [], workspaces: [], loading: false, error: undefined });
      return;
    }

    // Every server is asked in parallel, and one being down must not blank the
    // others — so failures are collected per server rather than thrown.
    const failures: string[] = [];
    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          let chats: { chats?: RawChat[] };
          try {
            chats = await transport.request<{ chats?: RawChat[] }>(server.id, "/chats");
          } catch (error) {
            // An older server has no /chats; that is not an error worth showing.
            const message = error instanceof Error ? error.message : String(error);
            if (!/\b404\b/.test(message)) throw error;
            chats = { chats: [] };
          }
          let workspaces: Workspace[] = [];
          try {
            const listed = await transport.request<{ workspaces?: RawWorkspace[] }>(server.id, "/workspaces");
            workspaces = (listed.workspaces ?? []).map((raw) => toWorkspace(raw, server.id));
          } catch {
            workspaces = [];
          }
          return {
            server: { ...server, online: true },
            chats: (chats.chats ?? []).map((raw) => toChat(raw, server.id)),
            workspaces,
          };
        } catch (error) {
          failures.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
          return { server: { ...server, online: false }, chats: [], workspaces: [] };
        }
      }),
    );

    set({
      servers: results.map((r) => r.server),
      chats: results.flatMap((r) => r.chats).sort(byAttention),
      workspaces: results.flatMap((r) => r.workspaces),
      loading: false,
      error: failures.length === servers.length ? failures.join("; ") : undefined,
      connected: results.some((r) => r.server.online),
    });
  },

  async addServer(input) {
    await transport.addServer(input);
    await get().refresh();
  },

  async removeServer(id) {
    await transport.removeServer(id);
    await get().refresh();
  },

  async updateServer(id, patch) {
    await transport.updateServer(id, patch);
    set((current) => ({
      servers: current.servers.map((server) => {
        if (server.id !== id) return server;
        const name = patch.name?.trim() || server.name;
        return {
          ...server,
          name,
          code: patch.name ? codeFor(name) : server.code,
          icon: patch.icon ?? server.icon,
          tint: patch.tint ?? server.tint,
        };
      }),
    }));
  },

  async addWorkspace(input) {
    const path = input.path.trim();
    const name = input.name?.trim() || nameFromPath(path);
    if (!name) throw new Error("Pick a folder to add.");

    if (useFixture) {
      const serverId = get().servers.find((server) => server.local)?.id ?? get().servers[0]?.id ?? "studio";
      set((current) => ({
        workspaces: [
          ...current.workspaces.filter((workspace) => !(workspace.serverId === serverId && workspace.path === path)),
          { id: crypto.randomUUID(), serverId, name, path, origin: null, worktrees: [] },
        ],
      }));
      return;
    }

    const server = localServer(get().servers);
    if (!server) throw new Error("This machine isn't connected.");
    await transport.request(server.id, "/workspaces", { method: "POST", body: { name, path } });
    await get().refresh();
  },

  async updateWorkspace(id, patch) {
    if (useFixture) {
      set((current) => ({
        workspaces: current.workspaces.map((workspace) => (workspace.id === id ? { ...workspace, ...patch } : workspace)),
      }));
      return;
    }
    const workspace = get().workspaces.find((entry) => entry.id === id);
    const server = get().servers.find((entry) => entry.id === workspace?.serverId) ?? localServer(get().servers);
    if (!server) throw new Error("This machine isn't connected.");
    await transport.request(server.id, `/workspaces/${encodeURIComponent(id)}`, { method: "PATCH", body: patch });
    set((current) => ({
      workspaces: current.workspaces.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }));
  },

  async removeWorkspace(id) {
    if (useFixture) {
      set((current) => ({ workspaces: current.workspaces.filter((workspace) => workspace.id !== id) }));
      return;
    }
    const workspace = get().workspaces.find((entry) => entry.id === id);
    const server = get().servers.find((entry) => entry.id === workspace?.serverId) ?? localServer(get().servers);
    if (!server) throw new Error("This machine isn't connected.");
    await transport.request(server.id, `/workspaces/${encodeURIComponent(id)}`, { method: "DELETE" });
    await get().refresh();
  },

  async suggestPaths(query) {
    if (useFixture) return [];
    const server = localServer(get().servers);
    if (!server?.online) return [];
    try {
      const listed = await transport.request<{ paths?: PathSuggestion[] }>(
        server.id,
        `/paths?q=${encodeURIComponent(query)}`,
      );
      return listed.paths ?? [];
    } catch {
      return [];
    }
  },

  async suggestWorkspaceIcons(id, query) {
    if (useFixture) return [];
    const workspace = get().workspaces.find((entry) => entry.id === id);
    const server = get().servers.find((entry) => entry.id === workspace?.serverId) ?? localServer(get().servers);
    if (!server?.online) return [];
    try {
      const listed = await transport.request<{ icons?: WorkspaceIconMatch[] }>(
        server.id,
        `/workspaces/${encodeURIComponent(id)}/icons?q=${encodeURIComponent(query)}`,
      );
      return listed.icons ?? [];
    } catch {
      return [];
    }
  },

  async workspaceFile(id, path) {
    if (useFixture) return undefined;
    const workspace = get().workspaces.find((entry) => entry.id === id);
    const server = get().servers.find((entry) => entry.id === workspace?.serverId) ?? localServer(get().servers);
    if (!server?.online) return undefined;
    try {
      const file = await transport.request<{ mime?: string; data?: string }>(
        server.id,
        `/workspaces/${encodeURIComponent(id)}/file?path=${encodeURIComponent(path)}`,
      );
      if (!file.mime || !file.data) return undefined;
      return { mime: file.mime, data: file.data };
    } catch {
      return undefined;
    }
  },

  async listBranches(workspaceId) {
    const workspace = get().workspaces.find((entry) => entry.id === workspaceId);
    const fromTrees = branchesFromWorktrees(workspace);
    if (useFixture) return fromTrees;
    const server = get().servers.find((entry) => entry.id === workspace?.serverId) ?? localServer(get().servers);
    if (!server) throw new Error("This machine isn't connected.");
    try {
      const listed = await transport.request<{ branches?: GitBranch[] }>(
        server.id,
        `/workspaces/${encodeURIComponent(workspaceId)}/branches`,
      );
      return listed.branches ?? fromTrees;
    } catch {
      return fromTrees;
    }
  },

  async checkoutBranch(input) {
    const workspace = get().workspaces.find((entry) => entry.id === input.workspaceId);
    const main = workspace?.worktrees.find((tree) => tree.isMain);
    if (input.mode === "main" && main && main.branch === input.branch) {
      return { path: main.path };
    }
    if (input.mode === "worktree") {
      const existing = workspace?.worktrees.find((tree) => tree.branch === input.branch && !tree.isMain);
      if (existing) return { path: existing.path };
    }
    if (useFixture) {
      return { path: main?.path ?? workspace?.path ?? "~" };
    }
    const server = get().servers.find((entry) => entry.id === workspace?.serverId) ?? localServer(get().servers);
    if (!server) throw new Error("This machine isn't connected.");
    const result = await transport.request<{ path?: string }>(
      server.id,
      `/workspaces/${encodeURIComponent(input.workspaceId)}/checkout`,
      { method: "POST", body: { branch: input.branch, mode: input.mode } },
    );
    await get().refresh();
    if (!result.path) throw new Error("Couldn't switch to that branch.");
    return { path: result.path };
  },

  async createChat(input) {
    const text = input.text.trim();
    if (!text) throw new Error("Write a message first.");
    const cwd = input.cwd.trim() || "~";
    const title = text.split("\n")[0]?.slice(0, 80) || "New chat";

    if (useFixture) {
      const serverId = input.serverId ?? get().servers.find((server) => server.local)?.id ?? get().servers[0]?.id ?? "studio";
      const chat: Chat = {
        id: crypto.randomUUID(),
        serverId,
        title,
        cwd,
        state: "working",
        preview: text,
        updatedAt: Date.now(),
      };
      set((current) => ({ chats: [chat, ...current.chats].sort(byAttention) }));
      return { id: chat.id, serverId };
    }

    const server = get().servers.find((entry) => entry.id === input.serverId) ?? localServer(get().servers);
    if (!server) throw new Error("This machine isn't connected.");
    const created = await transport.request<{ chat?: RawChat }>(server.id, "/chats", {
      method: "POST",
      body: {
        cwd,
        title,
        ...(input.model ? { model: input.model } : {}),
        ...(input.permissionMode ? { permissionMode: input.permissionMode } : {}),
      },
    });
    const id = created.chat?.id;
    if (!id) throw new Error("Couldn't start that chat.");
    await transport.request(server.id, `/chats/${encodeURIComponent(id)}/message`, {
      method: "POST",
      body: { text },
    });
    await get().refresh();
    return { id, serverId: server.id };
  },

  async openChat(id) {
    const chat = get().chats.find((entry) => entry.id === id);
    if (!chat) return;
    // Keep whatever is already on screen for this chat, so reopening it does
    // not blank the feed while the fetch is in flight.
    const same = get().detail?.id === id;
    set({ openId: id, detailLoading: !same, ...(same ? {} : { detail: undefined }) });

    if (useFixture) {
      set({ detail: { ...chat, entries: [], todos: [] }, detailLoading: false });
      return;
    }

    try {
      const raw = await transport.request<RawChatDetail>(
        chat.serverId,
        `/chats/${encodeURIComponent(id)}`,
      );
      // A slow fetch for a chat that has since been closed must not paint over
      // the one that is open now.
      if (get().openId !== id) return;
      set({ detail: toDetail(raw, chat.serverId), detailLoading: false });
    } catch (error) {
      if (get().openId !== id) return;
      set({ detailLoading: false });
      throw error;
    }
  },

  closeChat() {
    set({ openId: undefined, detail: undefined, detailLoading: false });
  },

  async sendMessage(text) {
    const detail = get().detail;
    const trimmed = text.trim();
    if (!detail || !trimmed) return;
    await transport.request(detail.serverId, `/chats/${encodeURIComponent(detail.id)}/message`, {
      method: "POST",
      body: { text: trimmed },
    });
    // The server echoes the message back as a `chat` frame. With the socket
    // down there is no frame coming, so read the feed once instead.
    if (!get().connected) await get().openChat(detail.id);
  },

  async answerApproval(requestId, decision) {
    const detail = get().detail;
    if (!detail) return;
    await transport.request(detail.serverId, `/chats/${encodeURIComponent(detail.id)}/approval`, {
      method: "POST",
      body: { requestId, decision },
    });
  },

  async answerQuestion(requestId, answers) {
    const detail = get().detail;
    if (!detail) return;
    await transport.request(detail.serverId, `/chats/${encodeURIComponent(detail.id)}/question`, {
      method: "POST",
      body: { requestId, answers },
    });
  },

  async interrupt() {
    const detail = get().detail;
    if (!detail) return;
    await transport.request(detail.serverId, `/chats/${encodeURIComponent(detail.id)}/interrupt`, {
      method: "POST",
      body: {},
    });
  },
}));

/// A live frame for one chat. `entries` are the ones that changed; the scalar
/// fields are always sent whole, so `null` means cleared rather than unchanged.
interface ChatFrame {
  type?: string;
  chatId?: string;
  entries?: ConvEntry[];
  removed?: string[];
  state?: ChatState;
  action?: string | null;
  approval?: ChatApproval | null;
  question?: ChatQuestionRequest | null;
  todos?: ConvTodo[];
  title?: string;
  live?: boolean;
  error?: string | null;
  updatedAt?: number;
}

interface RawChatDetail extends RawChat {
  entries?: ConvEntry[];
  todos?: ConvTodo[];
  approval?: ChatApproval | null;
  question?: ChatQuestionRequest | null;
  action?: string | null;
  live?: boolean;
  error?: string | null;
}

function toDetail(raw: RawChatDetail, serverId: string): ChatDetail {
  return {
    id: raw.id,
    serverId,
    title: raw.title,
    cwd: raw.cwd,
    model: raw.model,
    state: raw.state ?? "idle",
    action: raw.action ?? undefined,
    entries: raw.entries ?? [],
    todos: raw.todos ?? [],
    approval: raw.approval ?? undefined,
    question: raw.question ?? undefined,
    live: raw.live,
    error: raw.error ?? undefined,
  };
}

function applyChatFrame(current: State, frame: ChatFrame): Partial<State> {
  // The row in the list is patched in place rather than re-sorted: a chat that
  // is streaming would otherwise walk up and down the sidebar on every frame.
  const chats = current.chats.map((chat) =>
    chat.id === frame.chatId
      ? {
          ...chat,
          state: frame.state ?? chat.state,
          title: frame.title ?? chat.title,
          updatedAt: frame.updatedAt ?? chat.updatedAt,
        }
      : chat,
  );
  const detail =
    current.detail && current.detail.id === frame.chatId
      ? mergeDetail(current.detail, frame)
      : current.detail;
  return { chats, detail };
}

function mergeDetail(detail: ChatDetail, frame: ChatFrame): ChatDetail {
  let entries = detail.entries;
  if (frame.removed?.length) {
    const gone = new Set(frame.removed);
    entries = entries.filter((entry) => !gone.has(entry.id));
  }
  if (frame.entries?.length) {
    const next = entries.slice();
    for (const entry of frame.entries) {
      // A streaming entry keeps its place in the feed while its text grows.
      const at = next.findIndex((existing) => existing.id === entry.id);
      if (at >= 0) next[at] = entry;
      else next.push(entry);
    }
    entries = next;
  }
  return {
    ...detail,
    entries,
    state: frame.state ?? detail.state,
    action: frame.action === undefined ? detail.action : frame.action ?? undefined,
    approval: frame.approval === undefined ? detail.approval : frame.approval ?? undefined,
    question: frame.question === undefined ? detail.question : frame.question ?? undefined,
    todos: frame.todos ?? detail.todos,
    title: frame.title ?? detail.title,
    live: frame.live ?? detail.live,
    error: frame.error === undefined ? detail.error : frame.error ?? undefined,
  };
}

function toChat(raw: RawChat, serverId: string): Chat {
  return {
    id: raw.id,
    serverId,
    title: raw.title,
    cwd: raw.cwd,
    state: raw.state ?? "idle",
    model: raw.model,
    preview: raw.preview,
    updatedAt: raw.updatedAt ?? 0,
  };
}

function toWorkspace(raw: RawWorkspace, serverId: string): Workspace {
  return {
    id: raw.id,
    serverId,
    name: raw.name,
    path: raw.path,
    origin: raw.origin,
    icon: raw.icon,
    tint: raw.tint,
    worktrees: raw.worktrees ?? [],
  };
}

function branchesFromWorktrees(workspace?: Workspace): GitBranch[] {
  if (!workspace) return [];
  return workspace.worktrees.flatMap((tree) =>
    tree.branch
      ? [{ name: tree.branch, current: tree.isMain, checkout: tree.isMain ? "main" as const : "worktree" as const }]
      : [],
  );
}

function localServer(servers: Server[]): Server | undefined {
  return servers.find((server) => server.local) ?? servers.find((server) => server.online) ?? servers[0];
}

function nameFromPath(path: string): string {
  const part = path
    .replace(/\/+$/, "")
    .split("/")
    .filter((segment) => segment && segment !== "~")
    .pop();
  return part ?? "";
}

/// Needs-you first, then working, then most recently updated.
const RANK: Record<ChatState, number> = { needs_input: 0, working: 1, error: 2, idle: 3 };
function byAttention(a: Chat, b: Chat): number {
  return RANK[a.state] - RANK[b.state] || b.updatedAt - a.updatedAt;
}
