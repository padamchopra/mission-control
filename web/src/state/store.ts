import { create } from "zustand";
import { transport } from "~/lib/transport";
import { fixtureChats, fixtureServers, fixtureSessions } from "./fixture";
import type { Chat, ChatState, Server, Session, SessionState } from "./types";

/// The client's whole view of every connected server.
///
/// Pushes patch what is already here rather than triggering a refetch, so a
/// session changing state costs no requests. `/notify/stream` sends two kinds
/// of frame: `session` carries the new state inline, and `sessions` / `chats`
/// say only "the list changed", which is the one case that needs a fetch.
///
/// A poll runs underneath both, because the push channel does not see
/// everything. The server broadcasts `sessions` only when it is the one making
/// the change — a tmux session started from a terminal is invisible to it until
/// something asks `/sessions` again. Verified by watching the socket while
/// running `tmux new-session`: `hello` arrives, nothing else does. The iOS
/// client has the same fallback for the same reason. The interval is loose
/// while the socket is up, because then it is only covering that blind spot,
/// and tight while it is down, because then it is the only source of truth.

const useFixture = import.meta.env.VITE_MC_FIXTURE === "1";

interface RawSession {
  name: string;
  state?: SessionState;
  panePath?: string;
  paneCommand?: string;
  agent?: string;
  preview?: string;
  workspaceName?: string;
  lastOutputAt?: number;
}

interface RawChat {
  id: string;
  title: string;
  cwd: string;
  state?: ChatState;
  model?: string;
  preview?: string;
  updatedAt?: number;
}

interface State {
  servers: Server[];
  sessions: Session[];
  chats: Chat[];
  loading: boolean;
  /// Set when every configured server failed, so the UI can say why rather than
  /// showing an empty list as though nothing were running.
  error?: string;
  connected: boolean;

  start(): () => void;
  refresh(): Promise<void>;
}

/// How often to poll. Long while pushes are arriving, short while they aren't.
const POLL_CONNECTED_MS = 15_000;
const POLL_DISCONNECTED_MS = 4_000;

export const useStore = create<State>((set, get) => ({
  servers: useFixture ? fixtureServers : [],
  sessions: useFixture ? fixtureSessions : [],
  chats: useFixture ? fixtureChats : [],
  loading: !useFixture,
  connected: useFixture,

  start() {
    if (useFixture) return () => {};

    void get().refresh();

    const offPush = transport.subscribe((serverId, payload) => {
      const frame = payload as { type?: string; session?: string; state?: SessionState };
      switch (frame.type) {
        case "session": {
          // The frame carries the new state, so patch in place.
          set((current) => ({
            sessions: current.sessions.map((session) =>
              session.serverId === serverId && session.name === frame.session
                ? { ...session, state: frame.state ?? session.state }
                : session,
            ),
          }));
          break;
        }
        case "sessions":
        case "chats":
          // Only says the list changed; the contents have to be fetched.
          void get().refresh();
          break;
        default:
          // `hello`, `notification`, and the chat-feed frames are not part of
          // the fleet view yet.
          break;
      }
    });

    const offStatus = transport.onStatus((serverId, online) => {
      set((current) => ({
        connected: online || current.servers.some((s) => s.id !== serverId && s.online),
        servers: current.servers.map((server) =>
          server.id === serverId ? { ...server, online } : server,
        ),
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
    set({ loading: true });

    const servers = await transport.servers();
    if (servers.length === 0) {
      set({ servers: [], sessions: [], chats: [], loading: false, error: undefined });
      return;
    }

    // Every server is asked in parallel, and one being down must not blank the
    // others — so failures are collected per server rather than thrown.
    const failures: string[] = [];
    const results = await Promise.all(
      servers.map(async (server) => {
        try {
          const [sessions, chats] = await Promise.all([
            transport.request<{ sessions?: RawSession[] }>(server.id, "/sessions"),
            transport
              .request<{ chats?: RawChat[] }>(server.id, "/chats")
              // An older server has no /chats; that is not an error worth showing.
              .catch(() => ({ chats: [] as RawChat[] })),
          ]);
          return {
            server: { ...server, online: true },
            sessions: (sessions.sessions ?? []).map((raw) => toSession(raw, server.id)),
            chats: (chats.chats ?? []).map(toChat),
          };
        } catch (error) {
          failures.push(`${server.name}: ${error instanceof Error ? error.message : String(error)}`);
          return { server: { ...server, online: false }, sessions: [], chats: [] };
        }
      }),
    );

    set({
      servers: results.map((r) => r.server),
      sessions: results.flatMap((r) => r.sessions).sort(byAttention),
      chats: results.flatMap((r) => r.chats).sort((a, b) => b.updatedAt - a.updatedAt),
      loading: false,
      error: failures.length === servers.length ? failures.join("; ") : undefined,
      connected: results.some((r) => r.server.online),
    });
  },
}));

function toSession(raw: RawSession, serverId: string): Session {
  return {
    name: raw.name,
    serverId,
    state: raw.state ?? "unknown",
    path: raw.panePath ?? "",
    command: raw.paneCommand ?? "",
    agent: raw.agent ? raw.agent[0].toUpperCase() + raw.agent.slice(1) : "Shell",
    preview: raw.preview || undefined,
    workspace: raw.workspaceName,
    lastOutputAt: raw.lastOutputAt ?? 0,
  };
}

function toChat(raw: RawChat): Chat {
  return {
    id: raw.id,
    title: raw.title,
    cwd: raw.cwd,
    state: raw.state ?? "idle",
    model: raw.model,
    preview: raw.preview,
    updatedAt: raw.updatedAt ?? 0,
  };
}

/// Needs-you first, then working, then most recently active — the order the
/// fleet view is for.
const RANK: Record<SessionState, number> = { needs_input: 0, working: 1, idle: 2, unknown: 3 };
function byAttention(a: Session, b: Session): number {
  return RANK[a.state] - RANK[b.state] || b.lastOutputAt - a.lastOutputAt;
}
