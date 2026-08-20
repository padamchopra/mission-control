import { useCallback, useEffect, useState } from "react";

export type AppUpdatePhase = "idle" | "downloading" | "ready" | "installing";

/// In-app DMG download and relaunch, only present in the packaged Electron
/// shell. A browser still gets a GitHub link; that is the save-dialog path.
export function useAppUpdate() {
  const [phase, setPhase] = useState<AppUpdatePhase>("idle");
  const [received, setReceived] = useState(0);
  const [total, setTotal] = useState(0);

  const inApp = typeof window.remy?.downloadUpdate === "function";

  useEffect(() => {
    return window.remy?.onUpdateProgress?.((progress) => {
      setReceived(progress.received);
      setTotal(progress.total);
    });
  }, []);

  const download = useCallback(async (url: string) => {
    const bridge = window.remy;
    if (!bridge?.downloadUpdate) {
      window.open(url, "_blank", "noreferrer");
      return;
    }
    setPhase("downloading");
    setReceived(0);
    setTotal(0);
    try {
      await bridge.downloadUpdate(url);
      setPhase("ready");
    } catch (caught) {
      setPhase("idle");
      throw caught;
    }
  }, []);

  const install = useCallback(async () => {
    const bridge = window.remy;
    if (!bridge?.installUpdate) throw new Error("Open Remy to install this update.");
    setPhase("installing");
    try {
      await bridge.installUpdate();
    } catch (caught) {
      setPhase("ready");
      throw caught;
    }
  }, []);

  const percent = total > 0 ? Math.min(100, Math.round((received / total) * 100)) : undefined;

  return { inApp, phase, percent, download, install };
}
