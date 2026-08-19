import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useStore } from "@/state/store";
import type { WorkspaceIconMatch } from "@/state/types";

export function ProjectIconSearch({
  active,
  workspaceId,
  onPick,
}: {
  active: boolean;
  workspaceId: string;
  onPick: (path: string) => void;
}) {
  const suggestWorkspaceIcons = useStore((s) => s.suggestWorkspaceIcons);
  const [query, setQuery] = useState("");
  const [icons, setIcons] = useState<WorkspaceIconMatch[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!active) return;
    setQuery("");
    setIcons([]);
    setLoading(true);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void suggestWorkspaceIcons(workspaceId, query).then((next) => {
        if (cancelled) return;
        setIcons(next);
        setLoading(false);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, query, suggestWorkspaceIcons, workspaceId]);

  return (
    <Command shouldFilter={false} className="min-w-0 rounded-none bg-transparent">
      <CommandInput value={query} onValueChange={setQuery} placeholder="icon.png" autoFocus />
      <CommandList className="max-h-[240px]">
        <CommandEmpty>
          {loading ? <span className="shimmer">Looking for images…</span> : "No images match. Try icon or logo."}
        </CommandEmpty>
        {icons.length > 0 && (
          <CommandGroup>
            {icons.map((item) => (
              <CommandItem key={item.path} value={item.path} onSelect={() => onPick(item.path)} className="min-w-0">
                <Avatar size="sm" className="rounded-md">
                  {item.preview && <AvatarImage src={item.preview} alt="" />}
                  <AvatarFallback className="rounded-md">
                    <ImageIcon />
                  </AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{item.path}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}
