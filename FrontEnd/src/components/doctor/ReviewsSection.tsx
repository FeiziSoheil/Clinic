"use client";

/**
 * ============================================================================
 * CLINICK — REVIEWS SECTION (spec §7)
 * ============================================================================
 * Fetches a doctor's approved reviews from the API (mock-ready via
 * `USE_MOCK` in `lib/review-api`) and renders average + distribution + list.
 * Summary is computed from APPROVED reviews only (server-side when live).
 * ============================================================================
 */

import { RatingDistribution } from "@/components/booking/RatingDistribution";
import { Card, CardContent } from "@/components/ui/card";
import { useDoctorPublicReviews } from "@/hooks/useReviews";
import { ReviewCard } from "./ReviewCard";

function ReviewSkeleton() {
  return (
    <Card>
      <CardContent className="flex animate-pulse flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-full bg-muted" />
          <div className="space-y-2">
            <div className="h-4 w-24 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
        </div>
        <div className="h-4 w-full rounded bg-muted" />
        <div className="h-4 w-2/3 rounded bg-muted" />
      </CardContent>
    </Card>
  );
}

export function ReviewsSection({ doctorId }: { doctorId: string }) {
  const { data, isLoading, isError } = useDoctorPublicReviews(doctorId);

  const summary = data?.summary ?? {
    average: 0,
    total: 0,
    distribution: [0, 0, 0, 0, 0] as [number, number, number, number, number],
  };
  const reviews = data?.reviews ?? [];

  if (isError) {
    return (
      <p className="rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center text-sm text-destructive">
        بارگذاری نظرات ناموفق بود.
      </p>
    );
  }

  if (!isLoading && summary.total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 py-12 text-center">
        <p className="text-lg font-semibold">هنوز نظری ثبت نشده</p>
        <p className="text-sm text-muted-foreground">
          پس از اولین ویزیت، نخستین نظر را شما ثبت کنید.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="lg:sticky lg:top-28 lg:self-start">
        <RatingDistribution
          counts={summary.distribution}
          average={summary.average}
        />
      </div>

      <div className="flex flex-col gap-4">
        {isLoading
          ? Array.from({ length: 3 }).map((_, i) => <ReviewSkeleton key={i} />)
          : reviews.map((r) => <ReviewCard key={r.id} review={r} />)}
      </div>
    </div>
  );
}
