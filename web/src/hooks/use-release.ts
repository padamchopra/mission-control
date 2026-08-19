import { useCallback, useEffect, useState } from "react";
import { REMY_VERSION, fetchLatestRelease, isNewer, type RemyRelease } from "@/lib/release";

export function useRelease() {
  const [current, setCurrent] = useState(window.remy?.version ?? REMY_VERSION);
  const [latest, setLatest] = useState<RemyRelease>();
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void window.remy?.info?.().then((info) => {
      if (info.version) setCurrent(info.version);
    });
  }, []);

  const check = useCallback(async () => {
    setChecking(true);
    setError(undefined);
    try {
      const release = await fetchLatestRelease();
      setLatest(release);
      return release;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn't check for updates.";
      setError(message);
      throw caught;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void check().catch(() => {});
  }, [check]);

  const available = latest ? isNewer(latest.version, current) : false;

  return { current, latest, available, checking, error, check };
}
