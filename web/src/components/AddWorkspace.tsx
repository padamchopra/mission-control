import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PathPicker, PathPickerHints } from "@/components/PathPicker";
import { useStore } from "@/state/store";

export function AddWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const addWorkspace = useStore((s) => s.addWorkspace);
  const [path, setPath] = useState("~/");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!open) return;
    setPath("~/");
    setBusy(false);
    setError(undefined);
  }, [open]);


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



  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-3 p-0 sm:max-w-[520px]" showCloseButton>
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Add workspace</DialogTitle>
          <DialogDescription>Pick a folder on this machine.</DialogDescription>
        </DialogHeader>
        <PathPicker
          value={path}
          onChange={(next) => {
            setPath(next);
            setError(undefined);
          }}
          onSubmit={(next) => void submit(next)}
          autoFocus
        />
        {error && <p className="px-6 text-[13px] text-destructive">{error}</p>}
        <DialogFooter className="border-t border-border bg-muted px-4 py-2 sm:justify-between">
          <PathPickerHints confirm="Add" />
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
