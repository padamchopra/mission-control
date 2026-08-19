import { useEffect, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EditableName({
  value,
  onCommit,
  label,
}: {
  value: string;
  onCommit: (name: string) => void;
  label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelled = useRef(false);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = () => {
    if (cancelled.current) {
      cancelled.current = false;
      setDraft(value);
      setEditing(false);
      return;
    }
    const next = draft.trim();
    setEditing(false);
    if (!next) {
      setDraft(value);
      return;
    }
    if (next !== value) onCommit(next);
  };

  if (!editing) {
    return (
      <span className="flex min-w-0 items-center gap-1">
        <span className="truncate text-sm font-medium">{value}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label={`Rename ${label}`}
          onClick={() => {
            cancelled.current = false;
            setDraft(value);
            setEditing(true);
          }}
        >
          <Pencil />
        </Button>
      </span>
    );
  }

  return (
    <Input
      autoFocus
      value={draft}
      aria-label={label}
      onChange={(event) => setDraft(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") {
          cancelled.current = true;
          setDraft(value);
          setEditing(false);
        }
      }}
      className="h-7 px-1.5 font-medium"
    />
  );
}
