/**
 * ============================================================================
 * CLINICK — STAR RATING
 * ============================================================================
 * Accessible, fractional star rating for doctor & testimonial cards. Renders a
 * visual average with a numeric label; the real value is also exposed via an
 * aria-label so screen-reader users get the precise figure.
 * ============================================================================
 */

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { toPersianDigitsIfFa } from "./star-utils";

export function StarRating({
  value,
  count,
  locale = "fa",
  className,
  size = 14,
}: {
  value?: number;
  count?: number;
  locale?: "fa" | "en";
  className?: string;
  size?: number;
}) {
  if (typeof value !== "number") return null;
  const rounded = Math.round(value * 2) / 2;

  return (
    <span
      className={cn("inline-flex items-center gap-1", className)}
      aria-label={`امتیاز ${value} از ۵${typeof count === "number" ? `، ${count} نظر` : ""}`}
    >
      <span className="flex">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i + 1 <= Math.floor(rounded);
          const half = !filled && i + 0.5 === rounded;
          return (
            <span key={i} className="relative" style={{ width: size, height: size }}>
              <Star
                style={{ width: size, height: size }}
                className="text-amber-400/30"
                fill="currentColor"
              />
              {(filled || half) && (
                <span
                  className="absolute inset-0 overflow-hidden"
                  style={{ width: half ? "50%" : "100%" }}
                >
                  <Star
                    style={{ width: size, height: size }}
                    className="text-amber-400"
                    fill="currentColor"
                  />
                </span>
              )}
            </span>
          );
        })}
      </span>
      <span className="text-xs font-medium text-muted-foreground">
        {toPersianDigitsIfFa(value.toFixed(1), locale)}
        {typeof count === "number"
          ? ` (${toPersianDigitsIfFa(String(count), locale)})`
          : ""}
      </span>
    </span>
  );
}
