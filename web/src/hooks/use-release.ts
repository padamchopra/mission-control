import { useCallback, useEffect, useRef, useState } from "react";
import { REMY_VERSION, fetchReleasesSince, isLocalBuild, isNewer, type RemyRelease } from "@/lib/release";

export function useRelease() {
  const [current, setCurrent] = useState(window.remy?.version ?? REMY_VERSION);
  // The check reads this rather than closing over `current`, so learning the
  // real version from the shell does not have to rebuild the callback.
  const currentRef = useRef(current);
  currentRef.current = current;
  const [pending, setPending] = useState<RemyRelease[]>([]);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    void window.remy?.info?.().then((info) => {
      if (info.version) setCurrent(info.version);
    });
  }, []);

  // Everything newer than this build, not just the newest of them: what you
  // would be getting is the whole run of releases in between.
  const check = useCallback(async () => {
    setChecking(true);
    setError(undefined);
    try {
      const releases = await fetchReleasesSince(currentRef.current, window.remy?.arch);
      setPending(releases);
      return releases[0];
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Couldn't check for updates.";
      setError(message);
      throw caught;
    } finally {
      setChecking(false);
    }
  }, []);

  const local = isLocalBuild(current);

  useEffect(() => {
    // A build made here has no release to be behind, so nothing is asked of
    // GitHub either.
    if (local) return;
    void check().catch(() => {});
  }, [check, local]);

  const latest = pending[0];
  const available = !local && Boolean(latest) && isNewer(latest.version, current);

  return { current, latest, pending, available, local, checking, error, check };
}
