import { app, BrowserWindow, ipcMain, shell } from "electron";
import { join } from "node:path";
import { Connection, loadServers, saveServers, serversFile, type ServerConfig } from "./connection";

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
function wireIpc(): void {
  const configPath = serversFile(app.getPath("userData"));
  connection = new Connection(loadServers(configPath));

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

void app.whenReady().then(() => {
  wireIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => connection?.stop());
