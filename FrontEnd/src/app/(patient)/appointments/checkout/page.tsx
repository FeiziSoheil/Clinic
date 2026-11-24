"use client";

/**
 * ============================================================================
 * CLINICK — PATIENT CHECKOUT (panel)
 * ============================================================================
 * 1. Book the appointment from the public draft (auto on land).
 * 2. Open the existing PaymentSimulatorDialog for visit-fee payment.
 * 3. Show the booking result after a successful simulated payment.
 * ============================================================================
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Stethoscope,
} from "lucide-react";

import { useBookDraftAfterAuth } from "@/hooks/useResumeAfterLogin";
import { useDoctor } from "@/hooks/useDoctors";
import { useBookingSessionStore } from "@/store/bookingSession";
import { isDraftResumable } from "@/lib/booking-session";
import { formatToman, toPersianDigits } from "@/lib/utils";
import { formatJalali } from "@/lib/jalali";
import { PaymentSimulatorDialog } from "@/components/payment/PaymentSimulatorDialog";
import { BookingStepper } from "@/components/booking/BookingStepper";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function AppointmentCheckoutPage() {
  const draft = useBookingSessionStore((s) => s.draft);
  const checkout = useBookDraftAfterAuth(true);
  const doctorQuery = useDoctor(draft?.doctorId);

  // Always start false so SSR and the first client render match.
  const [hydrated, setHydrated] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const autoOpenedPayRef = useRef(false);

  useEffect(() => {
    const unsub = useBookingSessionStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    setHydrated(useBookingSessionStore.persist.hasHydrated());
    return unsub;
  }, []);

  // Open the simulated gateway once when the appointment is created.
  useEffect(() => {
    if (
      checkout.status === "awaiting_payment" &&
      checkout.appointmentId &&
      !autoOpenedPayRef.current
    ) {
      autoOpenedPayRef.current = true;
      setPayOpen(true);
    }
  }, [checkout.status, checkout.appointmentId]);

  if (!hydrated) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // After payment the draft is cleared — keep showing success without it.
  if (checkout.status === "done") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-success/30 bg-success/5 py-20 text-center">
        <CheckCircle2 className="size-12 text-success" aria-hidden />
        <h1 className="text-2xl font-bold">نوبت شما ثبت و پرداخت شد</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          می‌توانید جزئیات را در فهرست نوبت‌های خود ببینید.
        </p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link
            href="/appointments"
            className="rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
          >
            مشاهدهٔ نوبت‌های من
          </Link>
          <Link
            href="/doctors"
            className="rounded-xl border border-border bg-card px-6 py-2.5 text-sm font-medium hover:bg-muted"
          >
            بازگشت به پزشکان
          </Link>
        </div>
      </div>
    );
  }

  if (!draft?.doctorId || !isDraftResumable(draft)) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 py-20 text-center">
        <Stethoscope className="size-10 text-muted-foreground" aria-hidden />
        <h1 className="text-xl font-bold">رزروی برای پرداخت وجود ندارد</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          ابتدا از صفحهٔ عمومی، پزشک و زمان نوبت را انتخاب کنید.
        </p>
        <Link
          href="/doctors"
          className="mt-1 rounded-xl bg-brand px-6 py-2.5 text-sm font-semibold text-brand-foreground hover:bg-brand/90"
        >
          یافتن پزشک
        </Link>
      </div>
    );
  }

  const doctor = doctorQuery.data;
  const fee = doctor?.visit_fee ?? 0;

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-bold">پرداخت نوبت</h1>
        <BookingStepper current={draft.step === "pay" ? "pay" : "summary"} />
        <p className="text-sm text-muted-foreground">
          پس از ثبت نوبت، پرداخت از طریق درگاه شبیه‌سازی‌شده انجام می‌شود.
        </p>
      </header>

      {checkout.status === "conflict" ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4 text-sm"
        >
          <AlertTriangle className="size-5 shrink-0 text-amber-500" aria-hidden />
          <div className="flex flex-col gap-2">
            <p className="font-semibold text-amber-700 dark:text-amber-400">
              این نوبت دیگر در دسترس نیست
            </p>
            <p className="text-muted-foreground">
              {checkout.errorMessage ??
                "یک تاریخ و ساعت دیگر انتخاب کنید."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/booking"
                className="w-fit font-semibold text-brand underline-offset-2 hover:underline"
              >
                بازگشت به انتخاب زمان
              </Link>
              <button
                type="button"
                onClick={() => void checkout.retryBook()}
                className="font-semibold text-foreground underline-offset-2 hover:underline"
              >
                تلاش مجدد
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {checkout.status === "error" ? (
        <div
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {checkout.errorMessage ?? "خطایی رخ داد."}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg font-bold">خلاصهٔ نوبت</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">پزشک</dt>
              <dd className="font-medium">
                {doctorQuery.isLoading ? "…" : doctor?.full_name}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">تاریخ</dt>
              <dd className="font-medium tabular-nums">
                {formatJalali(draft.date)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">ساعت</dt>
              <dd className="font-medium tabular-nums">
                {toPersianDigits(draft.startTime)}
              </dd>
            </div>
            {doctor ? (
              <div className="flex justify-between gap-4 border-t border-border pt-3">
                <dt className="text-muted-foreground">مبلغ</dt>
                <dd className="text-base font-bold tabular-nums">
                  {formatToman(fee)}
                </dd>
              </div>
            ) : null}
          </dl>

          {checkout.status === "booking" ? (
            <p className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              در حال ثبت نوبت…
            </p>
          ) : null}

          {checkout.status === "awaiting_payment" && checkout.appointmentId ? (
            <button
              type="button"
              onClick={() => setPayOpen(true)}
              className="flex h-12 w-full items-center justify-center rounded-xl bg-brand px-6 text-base font-semibold text-brand-foreground hover:bg-brand/90"
            >
              پرداخت هزینهٔ ویزیت
            </button>
          ) : null}
        </CardContent>
      </Card>

      {checkout.appointmentId && doctor ? (
        <PaymentSimulatorDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          mode="visitfee"
          appointmentId={checkout.appointmentId}
          amount={fee}
          onSuccess={() => {
            setPayOpen(false);
            checkout.markPaid();
          }}
        />
      ) : null}
    </div>
  );
}
