import { app, BrowserWindow, ipcMain, shell } from "electron";
import { hostname as osHostname } from "node:os";
import { join } from "node:path";
import {
  Connection,
  loadServers,
  saveServers,
  serversFile,
  type DeviceIcon,
  type ServerConfig,
} from "./connection";
import { ensureLocalServer, isLoopback, localTargetFromConfig, stopSpawnedServer } from "./local-server";

/// The desktop shell. Deliberately thin — it owns the window and nothing else,
/// the same split T3 Code uses, so the UI stays a plain web app that can be run
/// and screenshotted in a browser without Electron in the way.

const DEV_SERVER = process.env.MC_DEV_SERVER_URL;
const isDev = Boolean(DEV_SERVER);

let connection: Connection | undefined;

/// Bridges the connection to the renderer.
///
/// Everything crosses as plain JSON over IPC: the renderer asks for a path and
/// gets a body back, and pushes arrive as events. It never learns a token, and
/// it cannot reach a server the main process has not been told about.
///
/// Called once for the app, not once per window: `ipcMain.handle` throws on a
/// second registration for the same channel, so doing this in `createWindow`
/// would crash the moment a window was reopened from the dock.
function urlsMatch(a: string, b: string): boolean {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.origin === right.origin;
  } catch {
    return a.replace(/\/$/, "") === b.replace(/\/$/, "");
  }
}

function withBuiltinLocal(existing: ServerConfig[], local: ServerConfig): ServerConfig[] {
  const match = existing.find((server) => urlsMatch(server.url, local.url));
  if (match) {
    return existing.map((server) =>
      server.id === match.id ? { ...server, token: local.token || server.token, builtin: true } : server,
    );
  }
  return [{ ...local, builtin: true }, ...existing];
}

async function wireIpc(): Promise<void> {
  const configPath = serversFile(app.getPath("userData"));
  let servers = loadServers(configPath);
  const envUrl = process.env.MC_SERVER_URL;
  if (!envUrl || isLoopback(envUrl)) {
    const target = await ensureLocalServer(join(__dirname, "../../server"), localTargetFromConfig());
    if (target.token) {
      servers = withBuiltinLocal(servers, {
        id: "local",
        name: osHostname().replace(/\.local$/, ""),
        url: target.url,
        token: target.token,
        icon: "laptop",
        builtin: true,
      });
      if (!envUrl) saveServers(configPath, servers);
    }
  }
  connection = new Connection(servers);

  // Broadcast rather than target one window, so a reopened window still
  // receives pushes without re-wiring anything.
  const send = (channel: string, ...args: unknown[]) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(channel, ...args);
    }
  };
  connection.on("push", (serverId: string, payload: unknown) => send("mc:push", serverId, payload));
  connection.on("status", (serverId: string, online: boolean, error?: string) =>
    send("mc:status", serverId, online, error),
  );

  ipcMain.handle("mc:servers", () => connection?.list() ?? []);

  ipcMain.handle("mc:add-server", (_event, input: { url: string; token: string; name?: string }) => {
    if (!connection) throw new Error("no connection");
    const url = input.url.trim();
    const token = input.token.trim();
    if (!url || !token) throw new Error("url and token are required");
    let hostname = url;
    try {
      hostname = new URL(url).hostname || url;
    } catch {
      // Keep the raw string as the name if it isn't a URL yet.
    }
    const existing = connection.configs();
    const id = existing.find((server) => server.url === url)?.id ?? crypto.randomUUID();
    const next = [
      ...existing.filter((server) => server.url !== url),
      { id, name: input.name?.trim() || hostname, url, token },
    ];
    saveServers(configPath, next);
    connection.replace(next);
    return connection.list();
  });

  ipcMain.handle("mc:remove-server", (_event, id: string) => {
    if (!connection) throw new Error("no connection");
    const target = connection.configs().find((server) => server.id === id);
    if (target?.builtin) throw new Error("This machine stays connected while Remy is running.");
    const next = connection.configs().filter((server) => server.id !== id);
    saveServers(configPath, next);
    connection.replace(next);
    return connection.list();
  });

  ipcMain.handle("mc:update-server", (_event, id: string, patch: { name?: string; icon?: DeviceIcon }) => {
    if (!connection) throw new Error("no connection");
    connection.update(id, patch);
    saveServers(configPath, connection.configs());
    return connection.list();
  });

  ipcMain.handle(
    "mc:request",
    async (_event, serverId: string, path: string, init?: { method?: string; body?: unknown }) => {
      if (!connection) throw new Error("no connection");
      // Errors are returned rather than thrown across IPC so the renderer gets
      // the server's message instead of Electron's serialisation of it.
      try {
        return { ok: true as const, data: await connection.request(serverId, path, init ?? {}) };
      } catch (error) {
        return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
      }
    },
  );

  ipcMain.handle("mc:set-servers", (_event, servers: ServerConfig[]) => {
    saveServers(configPath, servers);
    connection?.replace(servers);
    return connection?.list() ?? [];
  });

  connection.start();
}

function createWindow(): void {
  const window = new BrowserWindow({
    title: "Remy",
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 560,
    show: false,
    // `hiddenInset` keeps the native traffic lights but lets the app draw its
    // own titlebar strip behind them. The offset matches T3's, and the web side
    // reserves the space with --titlebar-traffic-light-inset.
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 18 },
    // Matches --background, so the first paint isn't a white flash.
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Show only once there is something to show.
  window.once("ready-to-show", () => window.show());

  // External links belong in the browser, not in a chrome-less app window with
  // no way back.
  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    void window.loadURL(DEV_SERVER!);
  } else {
    void window.loadFile(join(__dirname, "../../web/dist/index.html"));
  }
}

void app.whenReady().then(async () => {
  app.setName("Remy");
  await wireIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  connection?.stop();
  stopSpawnedServer();
});
