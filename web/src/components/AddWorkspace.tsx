import { useEffect, useRef, useState } from "react";
import { FolderGit2, Folder } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { displayPath } from "@/lib/path";
import { useStore } from "@/state/store";
import type { PathSuggestion } from "@/state/types";

export function AddWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addWorkspace = useStore((s) => s.addWorkspace);
  const suggestPaths = useStore((s) => s.suggestPaths);
  const [path, setPath] = useState("~/");
  const [suggestions, setSuggestions] = useState<PathSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const highlighted = useRef("");

  useEffect(() => {
    if (!open) return;
    setPath("~/");
    setSuggestions([]);
    setBusy(false);
    setError(undefined);
    highlighted.current = "";
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void suggestPaths(path).then((next) => {
        if (!cancelled) setSuggestions(next);
      });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, path, suggestPaths]);

  const submit = async (value = path) => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await addWorkspace({ path: trimmed });
      toast.success("Added the workspace.");
      onOpenChange(false);
    } catch (caught) {
      const message = apiError(caught);
      setError(message);
      toast.error("Couldn't add that folder", { description: message });
    } finally {
      setBusy(false);
    }
  };

  const drill = (item: PathSuggestion) => {
    setPath(displayPath(item.path).replace(/\/+$/, "") + "/");
    setError(undefined);
  };

  const highlightedPath = () => {
    const needle = highlighted.current.toLowerCase();
    return suggestions.find((item) => item.path.toLowerCase() === needle)?.path;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-0 sm:max-w-[520px]" showCloseButton>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Add workspace</DialogTitle>
          <DialogDescription>Pick a folder on this machine.</DialogDescription>
        </DialogHeader>
        <Command
          shouldFilter={false}
          className="rounded-none bg-transparent"
          onValueChange={(value) => {
            highlighted.current = value;
          }}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || busy) return;
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault();
              void submit(highlightedPath() ?? path);
            }
          }}
        >
          <CommandInput
            value={path}
            onValueChange={(next) => {
              setPath(next);
              setError(undefined);
            }}
            placeholder="~/code/my-project"
            autoFocus
            className="font-mono text-[13px]"
          />
          <CommandList className="max-h-[240px]">
            <CommandEmpty>No folders match.</CommandEmpty>
            {suggestions.length > 0 && (
              <CommandGroup>
                {suggestions.map((item) => (
                  <CommandItem
                    key={item.path}
                    value={item.path}
                    onSelect={() => drill(item)}
                    className="font-mono text-[12px]"
                  >
                    {item.repo ? (
                      <FolderGit2 className="size-3.5 shrink-0 text-primary" />
                    ) : (
                      <Folder className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{displayPath(item.path)}</span>
                    {item.repo && <span className="shrink-0 font-sans text-[11px] text-muted-foreground">git</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
        {error && <p className="px-6 text-[13px] text-destructive">{error}</p>}
        <DialogFooter className="border-t border-border bg-muted px-4 py-2 sm:justify-between">
          <span className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <KbdGroup>
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd>
              </KbdGroup>
              Navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> Open
            </span>
            <span className="flex items-center gap-1">
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>↵</Kbd>
              </KbdGroup>
              Add
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> Close
            </span>
          </span>
          <Button size="sm" disabled={busy || !path.trim()} onClick={() => void submit()}>
            {busy ? "Adding…" : "Add workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function apiError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return parsed.error;
  } catch {
    // The transport already unwrapped some failures into a plain string.
  }
  return raw;
}
