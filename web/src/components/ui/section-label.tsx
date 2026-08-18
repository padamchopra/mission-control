import { cn } from "~/lib/utils";

/// The quiet heading above a group of rows. Sentence case, the way T3 writes
/// "All projects" and "Settled" — the previous app shouted these in caps and it
/// was most of why the chrome read as a console.
export function SectionLabel({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-2 px-1 text-xs text-muted-foreground", className)}>
      <span className="font-medium">{children}</span>
      {trailing != null && <span className="ml-auto tabular-nums">{trailing}</span>}
    </div>
  );
}
