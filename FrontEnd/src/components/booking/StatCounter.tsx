/**
 * ============================================================================
 * CLINICK — STAT COUNTER (spec §3)
 * ============================================================================
 * Trust-band cell: icon + animated number + label. Delegates the count-up to
 * the existing viewport-triggered, reduced-motion-safe
 * [`AnimatedCounter`](src/components/marketing/motion/AnimatedCounter.tsx)
 * (Persian numerals), so this stays a thin presentational wrapper.
 * ============================================================================
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AnimatedCounter } from "@/components/marketing/motion/AnimatedCounter";

export interface StatCounterProps {
  icon?: ReactNode;
  value: number;
  /** Optional prefix/suffix, e.g. "+", "٪", "+". */
  prefix?: string;
  suffix?: string;
  /** Decimal places for fractional stats (e.g. rating 4.9). */
  decimals?: number;
  label: string;
  className?: string;
}

export function StatCounter({
  icon,
  value,
  prefix,
  suffix,
  decimals = 0,
  label,
  className,
}: StatCounterProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
      {icon ? (
        <span
          className="flex size-9 items-center justify-center rounded-full bg-brand-mint/60 text-brand"
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <div className="text-display-lg font-bold tabular-nums leading-none">
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          decimals={decimals}
        />
      </div>
      <span className="text-meta text-muted-foreground">{label}</span>
    </div>
  );
}
