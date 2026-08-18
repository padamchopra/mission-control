import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import WebSocket from "ws";

/// The connection to a Mission Control server, owned by the main process.
///
/// It lives here rather than in the renderer for two reasons, both of which are
/// properties of the server rather than preferences:
///
///   1. The server sends no CORS headers, so a renderer on another origin
///      cannot call it at all.
///   2. `/notify/stream` authorises the upgrade with an `Authorization: Bearer`
///      header, and a browser `WebSocket` cannot set request headers.
///
/// Keeping it in Node solves both without touching the server, and has the
/// better security property anyway: the token never enters the renderer, so a
/// stray dependency in the UI has nothing to steal.

export interface ServerConfig {
  id: string;
  name: string;
  url: string;
  token: string;
}

export interface ConnectionEvents {
  /// A frame from `/notify/stream`, tagged with which server it came from.
  push: (serverId: string, payload: unknown) => void;
  /// Connected / disconnected, so the UI can show a device as offline.
  status: (serverId: string, online: boolean, error?: string) => void;
}

/// Reconnect backoff. The server is usually on the same tailnet, so the first
/// retry is quick; the ceiling stops a sleeping laptop from hammering it.
const BACKOFF_MS = [500, 1_000, 2_000, 5_000, 10_000, 30_000];

export class Connection extends EventEmitter {
  private sockets = new Map<string, WebSocket>();
  private attempts = new Map<string, number>();
  private timers = new Map<string, NodeJS.Timeout>();
  private closing = false;

  constructor(private servers: ServerConfig[]) {
    super();
  }

  list(): Omit<ServerConfig, "token">[] {
    return this.servers.map(({ token: _token, ...rest }) => rest);
  }

  replace(servers: ServerConfig[]): void {
    this.stop();
    this.closing = false;
    this.servers = servers;
    this.start();
  }

  /// One REST call against a named server. Returns the parsed body, or throws
  /// with the server's own message so the UI can show something specific.
  async request<T>(
    serverId: string,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    const server = this.servers.find((s) => s.id === serverId);
    if (!server) throw new Error(`no server ${serverId}`);
    const response = await fetch(new URL(path, server.url), {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${server.token}`,
        ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      let message = `${response.status} ${response.statusText}`;
      try {
        const parsed = JSON.parse(text) as { error?: string };
        if (parsed.error) message = parsed.error;
      } catch {
        // A non-JSON body is still worth surfacing verbatim if it is short.
        if (text && text.length < 200) message = text;
      }
      throw new Error(message);
    }
    return (text ? JSON.parse(text) : null) as T;
  }

  start(): void {
    for (const server of this.servers) this.connect(server);
  }

  stop(): void {
    this.closing = true;
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
    for (const socket of this.sockets.values()) socket.close();
    this.sockets.clear();
  }

  private connect(server: ServerConfig): void {
    if (this.closing) return;
    const url = new URL("/notify/stream", server.url);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    // `notify=0` subscribes to live state without becoming a notification
    // target. The desktop app wants the banners, so it is left absent.

    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${server.token}` },
    });
    this.sockets.set(server.id, socket);

    socket.on("open", () => {
      this.attempts.set(server.id, 0);
      this.emit("status", server.id, true);
    });

    socket.on("message", (data) => {
      try {
        this.emit("push", server.id, JSON.parse(String(data)));
      } catch {
        // A frame that isn't JSON is not worth tearing the socket down for.
      }
    });

    socket.on("error", (error: Error) => {
      this.emit("status", server.id, false, error.message);
    });

    socket.on("close", () => {
      this.sockets.delete(server.id);
      this.emit("status", server.id, false);
      this.scheduleReconnect(server);
    });
  }

  private scheduleReconnect(server: ServerConfig): void {
    if (this.closing) return;
    const attempt = this.attempts.get(server.id) ?? 0;
    this.attempts.set(server.id, attempt + 1);
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    const timer = setTimeout(() => this.connect(server), delay);
    // Don't hold the process open just to retry a dead server.
    timer.unref?.();
    this.timers.set(server.id, timer);
  }
}

/// Servers come from a JSON file next to the app's other state, or from
/// `MC_SERVER_URL` / `MC_TOKEN` for a one-off run. There is no pairing UI yet,
/// so this is the seam the setup flow will write to.
export function loadServers(configPath: string): ServerConfig[] {
  const fromEnv = process.env.MC_SERVER_URL;
  if (fromEnv) {
    return [
      {
        id: "env",
        name: process.env.MC_SERVER_NAME ?? new URL(fromEnv).hostname,
        url: fromEnv,
        token: process.env.MC_TOKEN ?? "",
      },
    ];
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as { servers?: ServerConfig[] };
    return parsed.servers ?? [];
  } catch {
    return [];
  }
}

export function saveServers(configPath: string, servers: ServerConfig[]): void {
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(configPath, JSON.stringify({ servers }, null, 2));
}

export const serversFile = (userData: string) => join(userData, "servers.json");
