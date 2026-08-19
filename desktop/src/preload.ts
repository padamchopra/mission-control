import { contextBridge, ipcRenderer } from "electron";

/// The renderer's whole view of the outside world.
///
/// Deliberately narrow: a path and a method, never a URL and never a token. The
/// main process owns which servers exist and how to authenticate to them, so
/// the UI cannot be talked into reaching somewhere else.
contextBridge.exposeInMainWorld("remy", {
  platform: process.platform,
  version: process.env.npm_package_version,

  info: (): Promise<{ version: string; name: string }> => ipcRenderer.invoke("app:info"),

  servers: (): Promise<{ id: string; name: string; url: string; icon?: string; builtin?: boolean }[]> =>
    ipcRenderer.invoke("mc:servers"),

  setServers: (
    servers: { id: string; name: string; url: string; token: string }[],
  ): Promise<{ id: string; name: string; url: string }[]> =>
    ipcRenderer.invoke("mc:set-servers", servers),

  addServer: (input: {
    url: string;
    token: string;
    name?: string;
  }): Promise<{ id: string; name: string; url: string }[]> => ipcRenderer.invoke("mc:add-server", input),

  removeServer: (id: string): Promise<{ id: string; name: string; url: string; icon?: string; builtin?: boolean }[]> =>
    ipcRenderer.invoke("mc:remove-server", id),

  updateServer: (
    id: string,
    patch: { name?: string; icon?: string },
  ): Promise<{ id: string; name: string; url: string; icon?: string; builtin?: boolean }[]> =>
    ipcRenderer.invoke("mc:update-server", id, patch),

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

  /// Brings the window forward. A notification click can focus the page on its
  /// own, but only the main process can raise the window itself.
  focus: (): Promise<void> => ipcRenderer.invoke("mc:focus"),

  onStatus: (handler: (serverId: string, online: boolean, error?: string) => void) => {
    const listener = (_event: unknown, serverId: string, online: boolean, error?: string) =>
      handler(serverId, online, error);
    ipcRenderer.on("mc:status", listener);
    return () => ipcRenderer.off("mc:status", listener);
  },
});
