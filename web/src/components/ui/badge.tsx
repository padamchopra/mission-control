import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "~/lib/utils";

/// A status pill. Tones carry meaning, so a caller picks a tone rather than a
/// colour and the two can't disagree across surfaces.
const badgeVariants = cva(
  "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-muted text-muted-foreground",
        primary: "bg-primary/12 text-primary",
        success: "bg-success/14 text-success-foreground",
        warning: "bg-warning/16 text-warning-foreground",
        error: "bg-error/14 text-error-foreground",
        info: "bg-info/14 text-info-foreground",
      },
    },
    defaultVariants: { tone: "neutral" },
  },
);

export interface BadgeProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof badgeVariants> {
  /// Prefixes a filled dot, for live state.
  dot?: boolean;
}

export function Badge({ className, tone, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ tone }), className)} {...props}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
