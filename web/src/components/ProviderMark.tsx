import { SquareTerminal } from "lucide-react";
import { ClaudeMark } from "@/components/ClaudeMark";
import { cn } from "@/lib/utils";

/// The mark a provider wears, wherever Remy names one.
///
/// Claude has its own glyph. OpenAI does not publish one under a licence Remy
/// can vendor, so Codex wears a neutral one rather than a drawing of somebody
/// else's logo — recognisable by its place and its label, and never mistaken
/// for the brand.
export function ProviderMark({ provider, className }: { provider?: string; className?: string }) {
  if (provider === "codex") {
    return <SquareTerminal aria-label="Codex" className={cn("size-4 shrink-0 text-muted-foreground", className)} />;
  }
  return <ClaudeMark className={cn("text-claude", className)} />;
}
