import { contextBridge } from "electron";

/// Nothing is exposed yet: the UI talks to the Mission Control server over HTTP
/// and a WebSocket, exactly as the iOS app does, so it needs no privileged
/// bridge. This file exists so `contextIsolation` has a preload to point at and
/// so the first capability that does need the main process has somewhere to go.
contextBridge.exposeInMainWorld("missionControl", {
  platform: process.platform,
});
