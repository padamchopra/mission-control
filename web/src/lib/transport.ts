import type { Server } from "~/state/types";

/// How the UI reaches a Mission Control server.
///
/// Two implementations, because the app runs in two places:
///
///   - **Electron.** The main process owns the connection and the token. The
///     renderer asks over IPC. This is the real one, and it exists because the
///     server sends no CORS headers and authorises the `/notify/stream`
///     upgrade with a header a browser `WebSocket` cannot set.
///
///   - **A plain browser.** Vite proxies `/api` to the server and injects the
///     bearer header, so the same UI runs at `localhost:5173` for development
///     and for the screenshot harness. Same-origin, so CORS never applies.
///
/// Both speak the same interface, so no component knows which one it has.

export interface Transport {
  readonly kind: "electron" | "proxy";
  servers(): Promise<Server[]>;
  request<T>(serverId: string, path: string, init?: { method?: string; body?: unknown }): Promise<T>;
  /// Live frames. Returns an unsubscribe.
  subscribe(handler: (serverId: string, payload: unknown) => void): () => void;
  onStatus(handler: (serverId: string, online: boolean, error?: string) => void): () => void;
}

interface Bridge {
  platform: string;
  servers(): Promise<{ id: string; name: string; url: string }[]>;
  request(
    serverId: string,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  onPush(handler: (serverId: string, payload: unknown) => void): () => void;
  onStatus(handler: (serverId: string, online: boolean, error?: string) => void): () => void;
}

declare global {
  interface Window {
    missionControl?: Bridge;
  }
}

function electronTransport(bridge: Bridge): Transport {
  return {
    kind: "electron",
    async servers() {
      const list = await bridge.servers();
      return list.map((s) => ({ ...s, code: codeFor(s.name), online: false }));
    },
    async request<T>(serverId: string, path: string, init?: { method?: string; body?: unknown }) {
      const result = await bridge.request(serverId, path, init);
      if (!result.ok) throw new Error(result.error);
      return result.data as T;
    },
    subscribe: (handler) => bridge.onPush(handler),
    onStatus: (handler) => bridge.onStatus(handler),
  };
}

/// The browser path. `/api` is proxied by Vite; `/api/notify/stream` upgrades
/// through the same proxy, so the token stays server-side there too.
function proxyTransport(): Transport {
  let socket: WebSocket | undefined;
  const pushHandlers = new Set<(serverId: string, payload: unknown) => void>();
  const statusHandlers = new Set<(serverId: string, online: boolean, error?: string) => void>();
  // A single proxied server has no id of its own; everything is tagged "local"
  // so the shape matches the multi-server Electron case.
  const ID = "local";
  let attempt = 0;
  let closed = false;

  const connect = () => {
    if (closed) return;
    const url = new URL("/api/notify/stream", window.location.origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    socket = new WebSocket(url);
    socket.onopen = () => {
      attempt = 0;
      for (const handler of statusHandlers) handler(ID, true);
    };
    socket.onmessage = (event) => {
      try {
        const payload: unknown = JSON.parse(String(event.data));
        for (const handler of pushHandlers) handler(ID, payload);
      } catch {
        // Not JSON; not worth dropping the socket over.
      }
    };
    socket.onclose = () => {
      for (const handler of statusHandlers) handler(ID, false);
      if (closed) return;
      const delay = Math.min(500 * 2 ** attempt, 30_000);
      attempt += 1;
      setTimeout(connect, delay);
    };
  };

  return {
    kind: "proxy",
    async servers() {
      // The proxy points at exactly one server, and `/health` is the cheapest
      // way to learn whether it is actually there.
      try {
        await fetch("/api/health").then((r) => {
          if (!r.ok) throw new Error(String(r.status));
        });
        return [{ id: ID, name: "Local server", url: "/api", code: "LOCAL", online: true }];
      } catch {
        return [];
      }
    },
    async request<T>(_serverId: string, path: string, init?: { method?: string; body?: unknown }) {
      const response = await fetch(`/api${path}`, {
        method: init?.method ?? "GET",
        headers: init?.body === undefined ? {} : { "Content-Type": "application/json" },
        ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(text || `${response.status} ${response.statusText}`);
      return (text ? JSON.parse(text) : null) as T;
    },
    subscribe(handler) {
      // `closed` has to be cleared here, not just set on teardown. React mounts
      // effects twice in development, so the first unsubscribe would otherwise
      // latch the socket shut for the life of the page and no push would ever
      // arrive again — which is what happened.
      closed = false;
      pushHandlers.add(handler);
      if (!socket) connect();
      return () => {
        pushHandlers.delete(handler);
        if (pushHandlers.size === 0) {
          closed = true;
          socket?.close();
          socket = undefined;
        }
      };
    },
    onStatus(handler) {
      statusHandlers.add(handler);
      return () => statusHandlers.delete(handler);
    },
  };
}

/// A short device code, the way the iOS app labels servers in dense rows.
function codeFor(name: string): string {
  const letters = name
    .split(/[\s-_]+/)
    .map((word) => word[0])
    .filter(Boolean)
    .join("")
    .toUpperCase();
  return (letters || name.slice(0, 2)).slice(0, 4);
}

export const transport: Transport = window.missionControl
  ? electronTransport(window.missionControl)
  : proxyTransport();
