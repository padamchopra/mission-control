import { useEffect, useState } from "react";
import { Folder } from "lucide-react";
import { isProjectIconFile, projectIcon } from "@/lib/projects";
import { cn } from "@/lib/utils";
import { useStore } from "@/state/store";

const cache = new Map<string, string>();

export function WorkspaceIcon({
  workspaceId,
  icon,
  className,
}: {
  workspaceId: string;
  icon?: string | null;
  className?: string;
}) {
  if (isProjectIconFile(icon)) {
    return <WorkspaceFileIcon workspaceId={workspaceId} path={icon} className={className} />;
  }
  const Icon = projectIcon(icon);
  return <Icon className={className} />;
}

export function WorkspaceFileIcon({
  workspaceId,
  path,
  className,
}: {
  workspaceId: string;
  path: string;
  className?: string;
}) {
  const workspaceFile = useStore((s) => s.workspaceFile);
  const key = `${workspaceId}:${path}`;
  const [src, setSrc] = useState(cache.get(key));

  useEffect(() => {
    const cached = cache.get(key);
    setSrc(cached);
    if (cached) return;
    let cancelled = false;
    void workspaceFile(workspaceId, path).then((file) => {
      if (cancelled || !file) return;
      const next = `data:${file.mime};base64,${file.data}`;
      cache.set(key, next);
      setSrc(next);
    });
    return () => {
      cancelled = true;
    };
  }, [key, path, workspaceFile, workspaceId]);

  if (!src) return <Folder className={className} />;
  return <img src={src} alt="" className={cn("object-contain", className)} />;
}
