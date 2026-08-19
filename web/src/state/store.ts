import { create } from "zustand";
import { codeFor, type DeviceIconId } from "~/lib/devices";
import type { TintId } from "~/lib/tints";
import { transport } from "~/lib/transport";
import { fixtureChats, fixtureServers, fixtureWorkspaces } from "./fixture";
import type { Chat, ChatState, PathSuggestion, Server, Workspace, WorkspaceIconMatch } from "./types";

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
}

interface State {
  servers: Server[];
  chats: Chat[];
  workspaces: Workspace[];
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
}

/// How often to poll. Long while pushes are arriving, short while they aren't.
const POLL_CONNECTED_MS = 15_000;
const POLL_DISCONNECTED_MS = 4_000;

export const useStore = create<State>((set, get) => ({
  servers: useFixture ? fixtureServers : [],
  chats: useFixture ? fixtureChats : [],
  workspaces: useFixture ? fixtureWorkspaces : [],
  loading: !useFixture,
  connected: useFixture,

  start() {
    if (useFixture) return () => {};

    void get().refresh();

    const offPush = transport.subscribe((_serverId, payload) => {
      const frame = payload as { type?: string };
      if (frame.type === "chats") void get().refresh();
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
          { id: crypto.randomUUID(), serverId, name, path, origin: null },
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
}));

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
  };
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
