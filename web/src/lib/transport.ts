import { codeFor, isDeviceIcon, loadAppearance, saveAppearance, type DeviceIconId } from "~/lib/devices";
import type { TintId } from "~/lib/tints";
import type { Server } from "~/state/types";

/// How the UI reaches a Remy server.
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
  addServer(input: { url: string; token: string; name?: string }): Promise<void>;
  removeServer(id: string): Promise<void>;
  updateServer(id: string, patch: { name?: string; icon?: DeviceIconId; tint?: TintId }): Promise<void>;
}

interface ListedServer {
  id: string;
  name: string;
  url: string;
  icon?: string;
  builtin?: boolean;
}

interface Bridge {
  platform: string;
  version?: string;
  info?: () => Promise<{ version: string; name: string }>;
  servers(): Promise<ListedServer[]>;
  request(
    serverId: string,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
  onPush(handler: (serverId: string, payload: unknown) => void): () => void;
  onStatus(handler: (serverId: string, online: boolean, error?: string) => void): () => void;
  /// Raises the desktop window. Absent in a browser, and on an older shell.
  focus?(): Promise<void>;
  /// Captures the window to a file, and answers with where it went.
  snapshot?(): Promise<string>;
  addServer(input: {
    url: string;
    token: string;
    name?: string;
  }): Promise<ListedServer[]>;
  removeServer(id: string): Promise<ListedServer[]>;
  updateServer?(id: string, patch: { name?: string; icon?: string }): Promise<ListedServer[]>;
}

declare global {
  interface Window {
    missionControl?: Bridge;
    remy?: Bridge;
  }
}


function toServer(listed: ListedServer, online: boolean): Server {
  const appearance = loadAppearance()[listed.id];
  const name = appearance?.name || listed.name;
  const icon: DeviceIconId = appearance?.icon ?? (isDeviceIcon(listed.icon) ? listed.icon : "laptop");
  return {
    id: listed.id,
    name,
    url: listed.url,
    code: codeFor(name),
    online,
    icon,
    tint: appearance?.tint,
    local: listed.builtin,
  };
}

function electronTransport(bridge: Bridge): Transport {
  return {
    kind: "electron",
    async servers() {
      const list = await bridge.servers();
      return list.map((item) => toServer(item, false));
    },
    async request<T>(serverId: string, path: string, init?: { method?: string; body?: unknown }) {
      const result = await bridge.request(serverId, path, init);
      if (!result.ok) throw new Error(result.error);
      return result.data as T;
    },
    subscribe: (handler) => bridge.onPush(handler),
    onStatus: (handler) => bridge.onStatus(handler),
    async addServer(input) {
      await bridge.addServer(input);
    },
    async removeServer(id) {
      await bridge.removeServer(id);
    },
    async updateServer(id, patch) {
      saveAppearance(id, patch);
      if (bridge.updateServer) await bridge.updateServer(id, patch);
    },
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
    // Every handler below checks that this socket is still the current one.
    // Closing is asynchronous, so a socket torn down by an unsubscribe is still
    // delivering events while its replacement is already connecting — and its
    // close would otherwise schedule a *second* live socket. Two sockets means
    // the server counts this window twice and every notification arrives twice.
    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      if (socket !== ws) return;
      attempt = 0;
      for (const handler of statusHandlers) handler(ID, true);
    };
    ws.onmessage = (event) => {
      if (socket !== ws) return;
      try {
        const payload: unknown = JSON.parse(String(event.data));
        for (const handler of pushHandlers) handler(ID, payload);
      } catch {
        // Not JSON; not worth dropping the socket over.
      }
    };
    ws.onclose = () => {
      if (socket !== ws) return;
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
      // This preview talks to exactly one server — the one Vite is proxying.
      // List it even when /health is down so a blip looks like "offline", not
      // "nothing is paired".
      const fallback = import.meta.env.VITE_REMY_PROXY_DEVICE ?? "";
      if (!fallback) return [];
      const listed = { id: ID, name: fallback, url: "/api", builtin: true };
      try {
        const response = await fetch("/api/health");
        if (!response.ok) throw new Error(String(response.status));
        return [toServer(listed, true)];
      } catch {
        return [toServer(listed, false)];
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
    async addServer() {
      throw new Error("Pair more devices from the desktop app. This browser is using the Vite proxy.");
    },
    async removeServer() {
      throw new Error("This machine stays connected while Remy is running.");
    },
    async updateServer(id, patch) {
      saveAppearance(id, patch);
    },
  };
}

export const transport: Transport = window.remy
  ? electronTransport(window.remy)
  : window.missionControl
    ? electronTransport(window.missionControl)
    : proxyTransport();
