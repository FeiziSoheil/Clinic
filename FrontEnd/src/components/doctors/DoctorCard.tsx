"use client";

import Image from "next/image";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { StarRating } from "@/components/marketing/ui/StarRating";
import { PRESS, TRANSITION } from "@/lib/motion";
import { cn, formatToman, toPersianDigits } from "@/lib/utils";
import type { DoctorCardModel } from "./types";

export interface DoctorCardProps extends DoctorCardModel {
  locale?: "fa" | "en";
  className?: string;
}

function initialsFromName(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter((p) => !/^(dr\.?|دکتر)$/i.test(p));
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
}

export function DoctorCard({
  name,
  specialty,
  initials: initialsProp,
  imageUrl,
  rating,
  reviewsCount,
  fee,
  availabilityLabel,
  verified,
  profileHref,
  bookHref,
  locale = "fa",
  className,
}: DoctorCardProps) {
  const bookLabel = locale === "en" ? "Book" : "نوبت‌دهی";
  const profileLabel = locale === "en" ? "Profile" : "پروفایل";
  const initials = (initialsProp?.trim() || initialsFromName(name)).trim();

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card",
        "shadow-soft hover:border-brand/55",
        TRANSITION.colors,
        className,
      )}
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 90vw"
            className="object-cover"
          />
        ) : (
          <div
            className="grid size-full place-items-center bg-brand-mint text-brand"
            aria-hidden="true"
          >
            <span className="text-4xl font-bold tracking-tight">
              {locale === "fa" ? toPersianDigits(initials || "؟") : initials || "?"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-base font-bold leading-tight tracking-tight">
              {name}
            </h3>
            {verified ? (
              <BadgeCheck
                className="size-4 shrink-0 text-brand"
                aria-label={locale === "en" ? "Verified" : "تأیید‌شده"}
              />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{specialty}</p>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <StarRating value={rating} count={reviewsCount} locale={locale} size={14} />
          {typeof fee === "number" ? (
            <span className="shrink-0 font-semibold tabular-nums">{formatToman(fee)}</span>
          ) : null}
        </div>

        {availabilityLabel ? (
          <p className="text-meta text-muted-foreground">{availabilityLabel}</p>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Link
            href={bookHref}
            className={cn(
              "inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              TRANSITION.interactive,
              PRESS,
            )}
          >
            {bookLabel}
          </Link>
          <Link
            href={profileHref}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium transition-colors hover:border-brand/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {profileLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function DoctorCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card",
        className,
      )}
      aria-hidden="true"
    >
      <div className="aspect-[4/3] w-full animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="space-y-2">
          <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex justify-between gap-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-auto flex gap-2 pt-1">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-muted" />
          <div className="h-10 w-20 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
