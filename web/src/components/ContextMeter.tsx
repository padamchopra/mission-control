import { InputGroupButton } from "@/components/ui/input-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { ContextUsage } from "@/state/types";

/// How full this session's context window is. A ring in the composer, with
/// counts on hover — the window size is otherwise invisible.
export function ContextMeter({ context }: { context?: ContextUsage }) {
  if (!context || context.limit <= 0) return null;

  const ratio = Math.min(1, context.tokens / context.limit);
  const percent = Math.round(ratio * 100);
  const used = formatTokens(context.tokens);
  const limit = formatTokens(context.limit);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <InputGroupButton
          type="button"
          size="icon-xs"
          aria-label={`${percent}% of context used`}
        >
          <Ring ratio={ratio} />
        </InputGroupButton>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs text-left text-pretty">
        <div className="flex flex-col gap-1">
          <p>
            {percent >= 100
              ? "You're at this session's context limit."
              : `You're using ${percent}% of this session's context.`}
          </p>
          <p>
            {used} of {context.limitEstimated ? "about " : ""}
            {limit} tokens so far.
          </p>
          {context.droppedTokens > 0 ? (
            <p>Compaction already dropped {formatTokens(context.droppedTokens)} of earlier history.</p>
          ) : context.compactions > 0 ? (
            <p>
              This session has compacted{" "}
              {context.compactions === 1 ? "once" : `${context.compactions} times`}.
            </p>
          ) : null}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

function Ring({ ratio }: { ratio: number }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  const filled = Math.min(1, Math.max(0, ratio));
  return (
    <svg viewBox="0 0 16 16" className="-rotate-90" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        strokeWidth="2"
        className="stroke-muted-foreground/25"
      />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - filled)}
        className={cn("stroke-current", filled >= 0.9 ? "text-destructive" : "text-foreground")}
      />
    </svg>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    return `${compact(m)}M`;
  }
  if (n >= 1_000) {
    const k = n / 1_000;
    return `${compact(k)}k`;
  }
  return String(Math.round(n));
}

function compact(n: number): string {
  return n >= 10 ? String(Math.round(n)) : String(Number(n.toFixed(1)));
}
