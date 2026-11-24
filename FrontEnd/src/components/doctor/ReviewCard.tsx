"use client";

/**
 * ============================================================================
 * CLINICK — REVIEW CARD (spec §7)
 * ============================================================================
 * A single verified patient review, Google-Maps-style: author initials, date,
 * stars, body, an optional doctor reply, and a "helpful" toggle. The helpful
 * action is optimistic and local-only until a backend reaction endpoint lands.
 * ============================================================================
 */

import { useState } from "react";
import { ThumbsUp } from "lucide-react";

import type { Review } from "@/lib/reviews";
import { cn, toPersianDigits } from "@/lib/utils";
import { StarRating } from "@/components/marketing/ui/StarRating";
import { VerifiedBadge } from "@/components/booking/VerifiedBadge";
import { Card, CardContent } from "@/components/ui/card";

function formatJalali(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat("fa-IR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }).format(d);
  } catch {
    return toPersianDigits(iso);
  }
}

export function ReviewCard({ review }: { review: Review }) {
  const [helpful, setHelpful] = useState(false);
  const helpfulCount = review.helpfulCount + (helpful ? 1 : 0);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex size-10 items-center justify-center rounded-full bg-brand-mint text-sm font-bold text-brand"
            aria-hidden="true"
          >
            {review.authorInitials}
          </span>
          <div className="flex flex-col">
            <span className="flex items-center gap-2 text-sm font-semibold">
              {review.authorInitials}
              <VerifiedBadge />
            </span>
            <span className="text-meta text-muted-foreground">
              {formatJalali(review.date)}
            </span>
          </div>
        </div>
        <StarRating value={review.rating} size={14} />
      </div>

      <p className="text-body leading-relaxed">{review.body}</p>

      {review.doctorReply ? (
        <div className="rounded-xl bg-muted/60 p-3 text-sm">
          <p className="mb-1 font-semibold text-brand">پاسخ پزشک</p>
          <p className="text-muted-foreground">{review.doctorReply}</p>
        </div>
      ) : null}

      <button
        type="button"
        aria-pressed={helpful}
        onClick={() => setHelpful((v) => !v)}
        className={cn(
          "flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-meta font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
          helpful
            ? "bg-brand-mint text-brand"
            : "text-muted-foreground hover:bg-muted",
        )}
      >
        <ThumbsUp className="size-3.5" aria-hidden="true" />
        مفید بود؟
        <span className="tabular-nums">
          ({toPersianDigits(helpfulCount.toString())})
        </span>
      </button>
      </CardContent>
    </Card>
  );
}
