"use client";

/**
 * ============================================================================
 * CLINICK — BOOKING REVIEW (public)
 * ============================================================================
 * Public half of the booking journey: restore the draft, pick date/time, and
 * hand off to the patient panel for auth + payment. No booking is committed
 * here — that happens on `/appointments/checkout` after login.
 * ============================================================================
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Stethoscope } from "lucide-react";

import { useBookingSession } from "@/hooks/useBookingSession";
import { useDoctor } from "@/hooks/useDoctors";
import { useAuthStore } from "@/store/authStore";
import { useBookingSessionStore } from "@/store/bookingSession";
import { cn, formatToman, toPersianDigits } from "@/lib/utils";
import { formatJalali } from "@/lib/jalali";
import { BookingStepper } from "./BookingStepper";
import { BookingDateTimePicker } from "./BookingDateTimePicker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const CHECKOUT_PATH = "/appointments/checkout";

/** No in-progress booking — invite the patient to start discovering. */
function EmptyBooking() {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 py-20 text-center">
      <Stethoscope className="size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="text-title-lg font-bold">رزرو در جریانی وجود ندارد</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        ابتدا پزشک موردنظر را انتخاب کنید؛ انتخاب‌های شما در همین صفحه ذخیره
        می‌شوند و پس از ورود از سر گرفته می‌شود.
      </p>
      <Link
        href="/doctors"
        className="mt-1 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
      >
        یافتن پزشک
      </Link>
    </div>
  );
}

export function BookingReview() {
  const { draft, patchDraft, setStep, requireAuth } = useBookingSession();
  const user = useAuthStore((s) => s.user);
  const doctorQuery = useDoctor(draft?.doctorId);

  // Always start false so SSR and the first client render match (skeleton),
  // then flip after persist rehydration — never read `.persist` during render.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    const unsub = useBookingSessionStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    setHydrated(useBookingSessionStore.persist.hasHydrated());
    return unsub;
  }, []);

  useEffect(() => {
    if (!draft) return;
    if ((!draft.date || !draft.startTime) && draft.step !== "datetime") {
      setStep("datetime");
    }
  }, [draft?.date, draft?.startTime, draft?.step, setStep]);

  if (!hydrated) {
    return (
      <div
        className="h-64 animate-pulse rounded-2xl bg-muted/40"
        aria-hidden="true"
      />
    );
  }

  if (!draft?.doctorId) {
    return <EmptyBooking />;
  }

  const doctor = doctorQuery.data;
  const hasDateTime = Boolean(draft.date && draft.startTime && draft.endTime);
  const isAuthenticated = Boolean(user);

  const handleContinue = () => {
    if (!hasDateTime) return;
    setStep("summary");
    // Auth gate + hand-off to the patient panel checkout.
    requireAuth(CHECKOUT_PATH);
  };

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-display-lg font-bold tracking-tight">تکمیل رزرو</h1>
        <BookingStepper current={draft.step} />
      </header>

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg font-bold">انتخاب تاریخ و ساعت</CardTitle>
          </CardHeader>
          <CardContent>
            <BookingDateTimePicker
              doctorId={draft.doctorId}
              visitDurationMinutes={doctor?.visit_duration_minutes ?? 30}
            />
          </CardContent>
        </Card>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">خلاصهٔ نوبت</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <dl className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">پزشک</dt>
                  <dd className="font-medium">
                    {doctorQuery.isLoading ? "در حال بارگذاری…" : doctor?.full_name}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">تاریخ</dt>
                  <dd className="font-medium tabular-nums">
                    {draft.date ? formatJalali(draft.date) : "—"}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">ساعت</dt>
                  <dd className="font-medium tabular-nums">
                    {draft.startTime ? toPersianDigits(draft.startTime) : "—"}
                  </dd>
                </div>
                {doctor ? (
                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <dt className="text-muted-foreground">حق ویزیت</dt>
                    <dd className="text-base font-bold tabular-nums">
                      {formatToman(doctor.visit_fee)}
                    </dd>
                  </div>
                ) : null}
              </dl>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">یادداشت (اختیاری)</span>
                <textarea
                  value={draft.notes ?? ""}
                  onChange={(e) => patchDraft({ notes: e.target.value })}
                  rows={2}
                  placeholder="اطلاعات تکمیلی برای پزشک…"
                  className="rounded-xl border border-border bg-background p-3 text-sm outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand"
                />
              </label>

              <button
                type="button"
                disabled={!hasDateTime}
                onClick={handleContinue}
                className={cn(
                  "flex h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold",
                  "bg-brand text-brand-foreground transition-all",
                  "hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {isAuthenticated ? "ادامه و پرداخت" : "ورود و پرداخت"}
              </button>

              <p className="text-center text-meta text-muted-foreground">
                پرداخت در پنل بیمار انجام می‌شود؛ انتخاب‌های شما ذخیره می‌مانند.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
