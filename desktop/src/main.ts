import { app, BrowserWindow, shell } from "electron";
import { join } from "node:path";

/// The desktop shell. Deliberately thin — it owns the window and nothing else,
/// the same split T3 Code uses, so the UI stays a plain web app that can be run
/// and screenshotted in a browser without Electron in the way.

const DEV_SERVER = process.env.MC_DEV_SERVER_URL;
const isDev = Boolean(DEV_SERVER);

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
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
