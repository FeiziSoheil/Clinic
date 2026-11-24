"use client";

/**
 * ============================================================================
 * CLINICK — RATING DISTRIBUTION (spec §7)
 * ============================================================================
 * Google-Maps-style rating breakdown: 5→1 bars sized by share of reviews.
 * The bars animate their width on first reveal (GSAP-free, CSS transition
 * toggled after mount) and are exposed as an accessible list so screen-reader
 * users hear "۴ ستاره: ۱۲۰ نظر".
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/utils";

export interface RatingDistributionProps {
  /** Count of reviews per star bucket, index 0 = 1★ … 4 = 5★. */
  counts: [number, number, number, number, number];
  /** Overall average rating (display only). */
  average?: number;
  className?: string;
}

const STAR_LABELS = ["۱ ستاره", "۲ ستاره", "۳ ستاره", "۴ ستاره", "۵ ستاره"];

export function RatingDistribution({
  counts,
  average,
  className,
}: RatingDistributionProps) {
  const [mounted, setMounted] = useState(false);
  // Defer the "mounted" flip out of the synchronous effect body so the bar
  // width transitions from 0 → final on the next frame (avoids a render cascade).
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Display buckets from 5★ → 1★ (matches the visual convention).
  const ordered = [...counts].map((c, i) => ({ star: i + 1, count: c })).reverse();
  const total = counts.reduce((a, b) => a + b, 0) || 1;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {typeof average === "number" ? (
        <div className="flex items-baseline gap-2">
          <span className="text-display-lg font-bold tabular-nums">
            {toPersianDigits(average.toFixed(1))}
          </span>
          <span className="text-meta text-muted-foreground">از ۵</span>
        </div>
      ) : null}

      <ul className="flex flex-col gap-1.5">
        {ordered.map(({ star, count }) => {
          const pct = Math.round((count / total) * 100);
          const countFa = toPersianDigits(count.toLocaleString("fa-IR"));
          return (
                <li
                  key={star}
                  className="flex items-center gap-3 text-sm"
                  aria-label={`${STAR_LABELS[star - 1]}: ${countFa} نظر`}
                >
                  <span className="w-14 shrink-0 text-muted-foreground tabular-nums">
                    {toPersianDigits(String(star))} ★
                  </span>
              <span
                className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                aria-hidden="true"
              >
                <span
                  className="block h-full rounded-full bg-gold transition-[width] duration-700 ease-out"
                  style={{ width: mounted ? `${pct}%` : "0%" }}
                />
              </span>
              <span className="w-10 shrink-0 text-end text-meta text-muted-foreground tabular-nums">
                {countFa}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
