import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "~/lib/utils";

/// The button, in shadcn's shape: variants owned in-tree via `cva`, so a look is
/// decided once here rather than re-invented per call site.
///
/// Sizes are T3 Code's desktop values. Its own variants are written mobile-first
/// (`h-9 … sm:h-8`, `text-base sm:text-sm`), so the numbers that apply in a
/// desktop window are the `sm:` ones — 24 / 28 / 32 / 36 / 40 with 16px glyphs
/// and a `text-sm` label. The `-1px` in the padding accounts for the border,
/// which is drawn inside the box.
const buttonVariants = cva(
  cn(
    "relative inline-flex shrink-0 cursor-default select-none items-center justify-center gap-2",
    "whitespace-nowrap rounded-[var(--control-radius)] border font-medium outline-none",
    "transition-[background-color,border-color,box-shadow,color] duration-[130ms]",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ),
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 active:bg-primary/80",
        secondary:
          "border-border bg-secondary text-foreground hover:bg-accent active:bg-accent",
        outline: "border-border bg-transparent text-foreground hover:bg-accent active:bg-accent",
        ghost: "border-transparent bg-transparent text-foreground hover:bg-accent active:bg-accent",
        "ghost-muted":
          "border-transparent bg-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
        destructive:
          "border-destructive bg-destructive text-white shadow-xs hover:bg-destructive/90",
        "destructive-outline":
          "border-border bg-transparent text-error-foreground hover:border-destructive/40 hover:bg-destructive/8",
      },
      size: {
        xs: "h-6 gap-1 px-[7px] text-xs",
        sm: "h-7 gap-1.5 px-[9px] text-xs",
        md: "h-8 px-[11px] text-sm",
        lg: "h-9 px-[13px] text-sm",
        xl: "h-10 px-[15px] text-base",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3.5",
        icon: "size-8",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp data-slot="button" className={cn(buttonVariants({ variant, size }), className)} {...props} />
  );
}

export { buttonVariants };
