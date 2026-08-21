import { cn } from "@/lib/utils";

/// Cursor's 2D cube mark, used in the compact places where Remy names it.
export function CursorMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      role="img"
      aria-label="Cursor"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      className={cn("size-4 shrink-0", className)}
    >
      <path d="m12 2 8.5 5v10L12 22l-8.5-5V7L12 2Z" />
      <path d="m3.5 7 8.5 5 8.5-5M12 12v10" />
      <path d="m7.75 4.5 8.5 5" />
    </svg>
  );
}
