"use client";

/**
 * Patient appointments page.
 *
 * Route: `/appointments`.
 *
 * The list is fetched from the REAL backend via
 * `GET /v1/bookings/me/appointments` (see {@link useMyAppointments}). The
 * "Cancel" and "Reschedule" actions call the real backend too
 * (`POST /v1/bookings/cancel` / `/reschedule`); both invalidate the list query
 * so it refetches automatically.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarClock,
  Clock,
  X,
  AlertTriangle,
  ShieldCheck,
  Loader2,
  MessageSquarePlus,
  MessagesSquare,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import {
  useCancelAppointment,
  useMyAppointments,
} from "@/hooks/useBooking";
import { useMyReviews } from "@/hooks/useReviews";
import type { AppointmentStatus, PaymentStatus } from "@/types/booking";
import type { AppointmentListItem } from "@/lib/booking-api";
import { formatJalaliLabel } from "@/lib/jalali";
import {
  CANCELLATION_TOO_LATE_MESSAGE,
  cancelAppointmentErrorDescription,
  isCancellationTooLateError,
} from "@/lib/booking-errors";
import { cn, formatToman } from "@/lib/utils";
import {
  RescheduleDialog,
  type ReschedulableAppointment,
} from "./_components/RescheduleDialog";
import {
  SubmitReviewDialog,
  type ReviewableAppointment,
} from "./_components/SubmitReviewDialog";
/**
 * Cancellation policy tiers.
 *
 * Mirrors the backend cancellation rules:
 *  - more than 24h before the visit → full refund,
 *  - between 3h and 24h before       → 50% penalty,
 *  - less than 3h before             → full penalty.
 */
type CancelTier = "full-refund" | "partial" | "full-penalty";

/** Compute the cancellation tier from the appointment datetime and now. */
function getCancelTier(dateIso: string, now: Date = new Date()): CancelTier {
  const diffMs = new Date(dateIso).getTime() - now.getTime();
  const hoursLeft = diffMs / 3_600_000;
  if (hoursLeft > 24) return "full-refund";
  if (hoursLeft > 3) return "partial";
  return "full-penalty";
}

/** Human-readable Persian label for each cancellation tier. */
const CANCEL_TIER_LABEL: Record<CancelTier, string> = {
  "full-refund": "بیش از ۲۴ ساعت مانده",
  partial: "بین ۳ تا ۲۴ ساعت مانده",
  "full-penalty": "کمتر از ۳ ساعت مانده",
};

/** Penalty percentage (0–100) applied for each tier. */
const CANCEL_TIER_PENALTY: Record<CancelTier, number> = {
  "full-refund": 0,
  partial: 50,
  "full-penalty": 100,
};

/** Badge styling per appointment status. */
function statusVariant(status: AppointmentStatus) {
  switch (status) {
    case "CONFIRMED":
    case "CHECKED_IN":
    case "CALLED":
      return "default" as const;
    case "PENDING":
      return "secondary" as const;
    case "IN_PROGRESS":
    case "COMPLETED":
      return "outline" as const;
    case "CANCELLED":
    case "NO_SHOW":
      return "destructive" as const;
  }
}

/** Badge styling per payment status. */
function paymentVariant(status: PaymentStatus) {
  switch (status) {
    case "PAID":
      return "default" as const;
    case "UNPAID":
      return "secondary" as const;
    case "REFUNDED":
      return "outline" as const;
  }
}

/** Persian labels for appointment statuses. */
const APPOINTMENT_STATUS_LABEL: Record<AppointmentStatus, string> = {
  PENDING: "در انتظار تأیید منشی",
  CONFIRMED: "تأییدشده",
  CHECKED_IN: "حاضر در مطب",
  CALLED: "فراخوان‌شده",
  IN_PROGRESS: "در حال ویزیت",
  COMPLETED: "تکمیل‌شده",
  CANCELLED: "لغوشده",
  NO_SHOW: "عدم مراجعه",
};

/** Persian labels for payment statuses. */
const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PAID: "پرداخت‌شده",
  UNPAID: "پرداخت‌نشده",
  REFUNDED: "بازگشت‌داده‌شده",
};

/** Format an ISO datetime into a readable Jalali label. */
function formatAppointment(apt: AppointmentListItem): string {
  const day = formatJalaliLabel(apt.date.slice(0, 10), "full");
  return `${day} · ${apt.startTime} – ${apt.endTime}`;
}

export default function AppointmentsPage() {
  const cancelAppointment = useCancelAppointment();

  // Fetch the patient's appointments from the real backend. Cancel/reschedule
  // mutations invalidate this query, so the list refreshes automatically.
  const { data: appointments, isLoading, isError } = useMyAppointments();
  const all = appointments ?? [];
  const { data: myReviews } = useMyReviews();
  const reviewedAppointmentIds = useMemo(() => {
    const set = new Set<string>();
    for (const r of myReviews ?? []) {
      set.add(r.appointment_id);
    }
    return set;
  }, [myReviews]);

  // Cancel-dialog state.
  const [target, setTarget] = useState<AppointmentListItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  // Reschedule-dialog state.
  const [rescheduleTarget, setRescheduleTarget] =
    useState<ReschedulableAppointment | null>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);

  // Review-dialog state (completed visits only).
  const [reviewTarget, setReviewTarget] =
    useState<ReviewableAppointment | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  /** Cancel tier + derived refund/penalty for the currently targeted apt. */
  const cancelTier = target ? getCancelTier(target.date) : null;
  const penaltyPct = cancelTier ? CANCEL_TIER_PENALTY[cancelTier] : 0;
  const penaltyAmount = target
    ? Math.round((target.fee * penaltyPct) / 100)
    : 0;
  const refundAmount = target ? target.fee - penaltyAmount : 0;
  const cancelBlockedWithin3h = cancelTier === "full-penalty";

  const active = useMemo(
    () =>
      all.filter(
        (a) =>
          a.status === "PENDING" ||
          a.status === "CONFIRMED" ||
          a.status === "CHECKED_IN" ||
          a.status === "CALLED" ||
          a.status === "IN_PROGRESS",
      ),
    [all],
  );
  const past = useMemo(
    () =>
      all.filter(
        (a) =>
          a.status === "COMPLETED" ||
          a.status === "CANCELLED" ||
          a.status === "NO_SHOW",
      ),
    [all],
  );

  function openCancel(apt: AppointmentListItem) {
    setTarget(apt);
    setDialogOpen(true);
  }

  function openReschedule(apt: AppointmentListItem) {
    setRescheduleTarget({
      id: apt.id,
      doctorName: apt.doctorName,
      doctorId: apt.doctorId,
      specialty: apt.specialty,
      visitDurationMinutes: apt.visitDurationMinutes,
    });
    setRescheduleOpen(true);
  }

  function openReview(apt: AppointmentListItem) {
    setReviewTarget({ id: apt.id, doctorName: apt.doctorName });
    setReviewOpen(true);
  }

  async function confirmCancel() {
    if (!target) return;

    try {
      await cancelAppointment.mutateAsync({ id: target.id });
      toast.success("نوبت لغو شد.");
      // The mutation invalidates the appointments query, so the list refetches.
      setDialogOpen(false);
      setTarget(null);
    } catch (err) {
      if (isCancellationTooLateError(err)) {
        toast.error(CANCELLATION_TOO_LATE_MESSAGE);
      } else {
        toast.error("لغو امکان‌پذیر نبود.", {
          description: cancelAppointmentErrorDescription(err),
        });
      }
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">نوبت‌های من</h1>
        <p className="text-sm text-muted-foreground">
          نوبت‌های آینده و گذشتهٔ خود را مشاهده و مدیریت کنید.
        </p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            در حال بارگذاری نوبت‌ها…
          </CardContent>
        </Card>
      )}

      {/* Error state */}
      {isError && (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            بارگذاری نوبت‌ها ناموفق بود. لطفاً دوباره تلاش کنید.
          </CardContent>
        </Card>
      )}

      {/* Active appointments */}
      {!isLoading && !isError && (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarDays className="size-4" />
            فعال
          </CardTitle>
          <CardDescription>نوبت‌های پیش‌روی شما.</CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="divide-y pt-0">
          {active.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              هیچ نوبت فعالی وجود ندارد.
            </p>
          ) : (
            active.map((apt) => (
              <div
                key={apt.id}
                className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{apt.doctorName}</span>
                    <Badge variant="secondary">{apt.specialty}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" />
                    <span className="min-w-0 break-words">
                      {formatAppointment(apt)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-2 md:items-end">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(apt.status)}>
                      {APPOINTMENT_STATUS_LABEL[apt.status]}
                    </Badge>
                    <Badge variant={paymentVariant(apt.paymentStatus)}>
                      {PAYMENT_STATUS_LABEL[apt.paymentStatus]}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:flex md:flex-wrap">
                    <Link
                      href={`/appointments/previsit/${apt.id}`}
                      className={cn(
                        buttonVariants({ variant: "secondary", size: "sm" }),
                        "inline-flex min-h-10 w-full items-center justify-center gap-1 md:w-auto",
                      )}
                    >
                      <MessagesSquare className="size-4" />
                      آماده‌سازی پیش‌ویزیت
                    </Link>
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10 w-full md:w-auto"
                      onClick={() => openReschedule(apt)}
                    >
                      <CalendarClock className="size-4" />
                      تغییر نوبت
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="min-h-10 w-full md:w-auto"
                      onClick={() => openCancel(apt)}
                      disabled={cancelAppointment.isPending}
                    >
                      <X className="size-4" />
                      لغو
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
      )}

    {/* Past appointments */}
    {!isLoading && !isError && (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4" />
          گذشته
        </CardTitle>
        <CardDescription>تاریخچهٔ نوبت‌های شما.</CardDescription>
      </CardHeader>
      <Separator />
      <CardContent className="divide-y pt-0">
        {past.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            هیچ نوبت گذشته‌ای وجود ندارد.
          </p>
        ) : (
          past.map((apt) => (
            <div
              key={apt.id}
              className="flex flex-col gap-3 py-4 md:flex-row md:items-center md:justify-between"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{apt.doctorName}</span>
                  <Badge variant="secondary">{apt.specialty}</Badge>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-3.5 shrink-0" />
                  <span className="min-w-0 break-words">
                    {formatAppointment(apt)}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={statusVariant(apt.status)}>
                  {APPOINTMENT_STATUS_LABEL[apt.status]}
                </Badge>
                <Badge variant={paymentVariant(apt.paymentStatus)}>
                  {PAYMENT_STATUS_LABEL[apt.paymentStatus]}
                </Badge>
                {apt.status === "COMPLETED" &&
                  (reviewedAppointmentIds.has(apt.id) ? (
                    <Badge variant="outline">نظر ثبت‌شده</Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-10 w-full sm:w-auto"
                      onClick={() => openReview(apt)}
                    >
                      <MessageSquarePlus className="size-4" />
                      ثبت نظر
                    </Button>
                  ))}
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
    )}

      {/* Cancel confirmation dialog (with cancellation-policy preview) */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              این نوبت لغو شود؟
            </DialogTitle>
            <DialogDescription>
              بر اساس خط‌مشی کنسلی، میزان بازگشت وجه بستگی به زمان لغو دارد.
            </DialogDescription>
          </DialogHeader>

          {/* Cancellation policy preview */}
          {target && cancelTier && (
            <div className="space-y-3 text-sm">
              {cancelBlockedWithin3h && (
                <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive">
                  {CANCELLATION_TOO_LATE_MESSAGE}
                </p>
              )}
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <ShieldCheck className="size-5 shrink-0 text-primary" />
                <div className="flex-1">
                  <p className="font-medium">خط‌مشی کنسلی</p>
                  <p className="text-xs text-muted-foreground">
                    {CANCEL_TIER_LABEL[cancelTier]}
                  </p>
                </div>
                <Badge
                  variant={cancelTier === "full-refund" ? "default" : "secondary"}
                >
                  {cancelBlockedWithin3h
                    ? "لغو مجاز نیست"
                    : penaltyPct === 0
                      ? "بازگشت کامل"
                      : `جریمه ${penaltyPct}٪`}
                </Badge>
              </div>

              {!cancelBlockedWithin3h && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">مبلغ ویزیت</span>
                  <span className="font-medium">
                    {formatToman(target.fee)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-destructive">جریمه</span>
                  <span className="font-medium text-destructive">
                    {formatToman(penaltyAmount)}
                  </span>
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-emerald-600 dark:text-emerald-400">
                    بازگشت وجه
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatToman(refundAmount)}
                  </span>
                </div>
              </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:flex-row sm:gap-2">
            <Button
              variant="outline"
              className="min-h-10 w-full sm:w-auto"
              onClick={() => setDialogOpen(false)}
              disabled={cancelAppointment.isPending}
            >
              نگه داشتن نوبت
            </Button>
            <Button
              variant="destructive"
              className="min-h-10 w-full sm:w-auto"
              onClick={confirmCancel}
              disabled={cancelAppointment.isPending || cancelBlockedWithin3h}
            >
              {cancelAppointment.isPending ? "در حال لغو..." : "لغو نوبت"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule dialog */}
      <RescheduleDialog
        appointment={rescheduleTarget}
        open={rescheduleOpen}
        onOpenChange={setRescheduleOpen}
      />

      {/* Leave a review after a completed visit */}
      <SubmitReviewDialog
        appointment={reviewTarget}
        open={reviewOpen}
        onOpenChange={setReviewOpen}
      />
    </div>
  );
}
