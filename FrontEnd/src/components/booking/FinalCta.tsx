import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * ============================================================================
 * CLINICK — FINAL CTA (spec §14)
 * ============================================================================
 * A calm, patient-friendly closing band (not salesy). Soft brand gradient,
 * single clear primary action into discovery, plus a ghost "earliest slot"
 * shortcut. Rendered server-side for SEO + LCP friendliness.
 * ============================================================================
 */
export function FinalCta({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="final-cta-title"
      className={cn("marketing-section", className)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 opacity-90"
        style={{
          background:
            "radial-gradient(ellipse 60% 80% at 50% 120%, color-mix(in oklch, var(--brand) 14%, transparent), transparent 60%)",
        }}
      />
      <div className="booking-container">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 rounded-[2rem] border border-border bg-card/60 px-6 py-14 text-center shadow-card backdrop-blur">
          <h2
            id="final-cta-title"
            className="text-display-lg font-bold tracking-tight"
          >
            آماده‌اید ویزیت خود را رزرو کنید؟
          </h2>
          <p className="max-w-md text-body-lg text-muted-foreground">
            در کمتر از یک دقیقه پزشک مناسب را پیدا کنید و نوبت بگیرید — بدون
            انتظار و بدون تماس.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/doctors"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-brand px-8 text-base font-semibold text-brand-foreground shadow-soft transition-all hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
            >
              یافتن پزشک
            </Link>
            <Link
              href="/doctors?sort=rating"
              className="inline-flex h-12 items-center justify-center rounded-xl border border-border bg-card px-8 text-base font-medium transition-colors hover:border-brand/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              اولین نوبت خالی
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
