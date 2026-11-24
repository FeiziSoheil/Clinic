"use client";

/**
 * ============================================================================
 * CLINICK — STICKY MOBILE CTA
 * ============================================================================
 * A mobile-only, thumb-reachable action bar that slides up once the visitor
 * scrolls past the hero. It keeps the primary "Book Appointment" action one tap
 * away at all times — a proven mobile-conversion lift. Hidden on desktop and on
 * reduced-motion (where it would just snap in), and dismissible so it never
 * blocks content.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/marketing/types";

export function StickyMobileCTA({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.7);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (dismissed) return null;

  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 lg:hidden",
        "transition-transform duration-300 ease-out motion-reduce:transition-none",
        visible ? "translate-y-0" : "translate-y-full",
      )}
    >
      <div className="marketing-glass mx-3 mb-3 flex items-center gap-3 rounded-2xl border border-border/70 p-2 shadow-float">
        <div className="min-w-0 flex-1 ps-2">
          <p className="truncate text-sm font-bold text-foreground font-vazir">
            {locale === "en" ? "Book in seconds" : "در چند ثانیه نوبت بگیرید"}
          </p>
          <p className="truncate text-xs text-muted-foreground font-vazir">
            {locale === "en" ? "350+ verified doctors" : "بیش از ۳۵۰ پزشک تأییدشده"}
          </p>
        </div>
        <button
          type="button"
          aria-label={locale === "en" ? "Dismiss" : "بستن"}
          onClick={() => setDismissed(true)}
          className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted"
        >
          <X className="size-4" />
        </button>
        <Link
          href="/booking"
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-gradient-to-br from-brand to-[var(--gradient-mid)] px-5 text-sm font-semibold text-white shadow-glow"
        >
          <CalendarCheck className="size-4" />
          {locale === "en" ? "Book now" : "رزرو نوبت"}
        </Link>
      </div>
    </div>
  );
}
