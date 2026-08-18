import { contextBridge, ipcRenderer } from "electron";

/// The renderer's whole view of the outside world.
///
/// Deliberately narrow: a path and a method, never a URL and never a token. The
/// main process owns which servers exist and how to authenticate to them, so
/// the UI cannot be talked into reaching somewhere else.
contextBridge.exposeInMainWorld("missionControl", {
  platform: process.platform,

  servers: (): Promise<{ id: string; name: string; url: string }[]> =>
    ipcRenderer.invoke("mc:servers"),

  setServers: (
    servers: { id: string; name: string; url: string; token: string }[],
  ): Promise<{ id: string; name: string; url: string }[]> =>
    ipcRenderer.invoke("mc:set-servers", servers),

  request: (
    serverId: string,
    path: string,
    init?: { method?: string; body?: unknown },
  ): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> =>
    ipcRenderer.invoke("mc:request", serverId, path, init),

  /// Live frames from `/notify/stream`. Returns an unsubscribe.
  onPush: (handler: (serverId: string, payload: unknown) => void) => {
    const listener = (_event: unknown, serverId: string, payload: unknown) =>
      handler(serverId, payload);
    ipcRenderer.on("mc:push", listener);
    return () => ipcRenderer.off("mc:push", listener);
  },

  onStatus: (handler: (serverId: string, online: boolean, error?: string) => void) => {
    const listener = (_event: unknown, serverId: string, online: boolean, error?: string) =>
      handler(serverId, online, error);
    ipcRenderer.on("mc:status", listener);
    return () => ipcRenderer.off("mc:status", listener);
  },
});
