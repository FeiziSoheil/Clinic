"use client";

/**
 * ============================================================================
 * CLINICK — QUICK FILTER CHIP (spec §2, §5)
 * ============================================================================
 * Toggle chip for hero quick-filters and the active-facet rail on the
 * discovery page. Accessible as a real toggle button (`aria-pressed`), 44px
 * friendly tap target, with a subtle brand fill when active.
 * ============================================================================
 */

import { TRANSITION } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface QuickFilterChipProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
  /** Optional leading icon name/glyph rendered before the label. */
  icon?: React.ReactNode;
}

export function QuickFilterChip({
  active = false,
  icon,
  className,
  children,
  ...props
}: QuickFilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium outline-none",
        TRANSITION.interactive,
        "focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active
          ? "border-brand bg-brand text-brand-foreground shadow-soft"
          : "border-border bg-card/70 text-foreground hover:border-brand/40 hover:bg-brand-mint/40",
        className,
      )}
      {...props}
    >
      {icon ? (
        <span className="flex size-4 items-center justify-center" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
}
