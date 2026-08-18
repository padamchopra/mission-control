import { cn } from "~/lib/utils";

/// Keycaps for shortcut hints. Display only — the real shortcut is registered
/// by whoever owns the action.
export function Kbd({ keys, className }: { keys: string[]; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-4 min-w-4 items-center justify-center rounded-[4px] border border-border bg-muted px-1 font-sans text-[10px] leading-none text-muted-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
