"use client";

/**
 * Reception — Monthly Doctor Calendar.
 *
 * Route: `/reception/calendar`.
 *
 * Renders a Jalali month grid where every day cell shows the appointment
 * status breakdown (colored segments) plus a total count. Hovering a day with
 * appointments reveals a Persian summary tooltip; clicking a day opens a modal
 * with the full appointment list (patient name/phone, time range, status,
 * payment) fetched via the "me" daily timeline endpoint. Prev/next buttons
 * cycle the displayed Jalali month.
 *
 * The monthly + daily data is resolved server-side from the JWT ("me"), so a
 * receptionist is transparently mapped to their employer doctor — the client
 * never needs to know the doctor id.
 *
 * All copy is Persian and the layout is RTL.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  Phone,
  RefreshCw,
  Stethoscope,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import { cn } from "@/lib/utils";
import {
  JALALI_WEEKDAYS,
  buildJalaliMonthGrid,
  formatJalaliLabel,
  isoToJalali,
  toPersianDigits,
  todayIso,
} from "@/lib/jalali";
import { useMyDailyTimeline, useMyMonthlyAppointmentsByRange } from "@/hooks/useBooking";
import type {
  AppointmentStatus,
  MonthlyAppointmentSummary,
  PaymentStatus,
} from "@/types/booking";

/**
 * Status → color used for the per-day breakdown bar segments.
 *
 * Order matters: segments are rendered in this sequence so the bar reads
 * consistently left-to-right across every cell.
 */
const statusSegments: {
  key: keyof Omit<MonthlyAppointmentSummary, "date" | "total">;
  className: string;
}[] = [
  { key: "completed", className: "bg-green-500" },
  { key: "confirmed", className: "bg-blue-500" },
  { key: "pending", className: "bg-yellow-500" },
  { key: "in_progress", className: "bg-purple-500" },
  { key: "checked_in", className: "bg-sky-500" },
  { key: "called", className: "bg-violet-500" },
  { key: "no_show", className: "bg-red-500" },
  { key: "cancelled", className: "bg-zinc-400" },
];

/**
 * Persian label + badge styling for each appointment lifecycle status.
 *
 * `badge` is a pill-style className used on the status `Badge` — a colored
 * solid-ish pill with readable contrasting text. The card itself stays neutral;
 * only the badge communicates the status.
 */
const statusConfig: Record<
  AppointmentStatus,
  { label: string; badge: string; dot: string }
> = {
  PENDING: {
    label: "در انتظار تأیید منشی",
    dot: "bg-yellow-500",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
  },
  CONFIRMED: {
    label: "تأییدشده",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
  },
  CHECKED_IN: {
    label: "حاضر در مطب",
    dot: "bg-sky-500",
    badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  },
  CALLED: {
    label: "فراخوان‌شده",
    dot: "bg-violet-500",
    badge: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200",
  },
  IN_PROGRESS: {
    label: "در حال ویزیت",
    dot: "bg-purple-500",
    badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  },
  COMPLETED: {
    label: "تکمیل‌شده",
    dot: "bg-green-500",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  },
  CANCELLED: {
    label: "لغوشده",
    dot: "bg-zinc-400",
    badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300",
  },
  NO_SHOW: {
    label: "عدم مراجعه",
    dot: "bg-red-500",
    badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  },
};

/** Persian label + badge styling for each payment status. */
const paymentConfig: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  UNPAID: {
    label: "پرداخت‌نشده",
    className: "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300",
  },
  PAID: {
    label: "پرداخت‌شده",
    className: "border-green-300 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300",
  },
  REFUNDED: {
    label: "بازگشت‌داده‌شده",
    className: "border-zinc-300 bg-zinc-50 text-zinc-600 dark:bg-zinc-900/40 dark:text-zinc-300",
  },
};

const JALALI_MONTH_NAMES = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/**
 * Normalize a time value to `"HH:mm"`.
 *
 * The timeline endpoint returns `start_time`/`end_time` as full ISO timestamps,
 * but the page renders wall-clock `"HH:mm"`. Values already in `"HH:mm"` form
 * (no `"T"`) are passed through unchanged. ISO values are converted to Tehran
 * local time (fixed UTC+03:30; Iran abolished DST in 2022).
 */
function toHHmm(value: string): string {
  if (!value || !value.includes("T")) return value;
  const d = new Date(value);
  const tehranMs = d.getTime() + 3.5 * 60 * 60 * 1000;
  const td = new Date(tehranMs);
  const hh = String(td.getUTCHours()).padStart(2, "0");
  const mm = String(td.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/**
 * Build a Persian summary string for a day's appointment breakdown, e.g.
 * `"۳ نوبت · ۲ تأییدشده، ۱ در انتظار تأیید"`. Returns an empty string when the
 * day has no appointments.
 */
function buildDayTooltip(s: MonthlyAppointmentSummary): string {
  if (!s.total) return "";
  const parts: string[] = [];
  const labels: Record<string, string> = {
    pending: "در انتظار تأیید منشی",
    confirmed: "تأییدشده",
    checked_in: "حاضر در مطب",
    called: "فراخوان‌شده",
    in_progress: "در حال ویزیت",
    completed: "تکمیل‌شده",
    cancelled: "لغوشده",
    no_show: "عدم مراجعه",
  };
  statusSegments.forEach((seg) => {
    const count = s[seg.key];
    if (count) parts.push(`${toPersianDigits(count)} ${labels[seg.key]}`);
  });
  const header = `${toPersianDigits(s.total)} نوبت`;
  return parts.length ? `${header} · ${parts.join("، ")}` : header;
}

/**
 * Per-status styling for the compact day-count badge. The badge color reflects
 * the "dominant" status of a day so a quick glance communicates the kind of
 * activity (pending, confirmed, in-progress…), not just that there is any.
 */
const badgeStatusStyle: Record<
  keyof Omit<MonthlyAppointmentSummary, "date" | "total">,
  { className: string }
> = {
  pending: { className: "bg-yellow-500 text-white" },
  confirmed: { className: "bg-blue-500 text-white" },
  checked_in: { className: "bg-sky-500 text-white" },
  called: { className: "bg-violet-500 text-white" },
  in_progress: { className: "bg-purple-500 text-white" },
  completed: { className: "bg-green-500 text-white" },
  no_show: { className: "bg-red-500 text-white" },
  cancelled: { className: "bg-zinc-400 text-white" },
};

/**
 * Priority order used to pick the "dominant" status when several statuses share
 * a day. Earlier entries win ties so currently-active states surface first.
 */
const statusPriority: (keyof typeof badgeStatusStyle)[] = [
  "in_progress",
  "called",
  "checked_in",
  "confirmed",
  "pending",
  "completed",
  "no_show",
  "cancelled",
];

/**
 * Return the className for the dominant status of a day (highest count, ties
 * broken by `statusPriority`). Falls back to a primary tint if unknown.
 */
function dominantBadgeClass(
  s: MonthlyAppointmentSummary,
): string {
  let best: keyof typeof badgeStatusStyle | null = null;
  let bestCount = 0;
  for (const key of statusPriority) {
    const count = s[key] ?? 0;
    if (count > bestCount) {
      bestCount = count;
      best = key;
    }
  }
  return best
    ? badgeStatusStyle[best].className
    : "bg-primary text-primary-foreground";
}

export default function ReceptionCalendarPage() {
  const router = useRouter();

  // Current Jalali month shown in the grid (defaults to today's month).
  const todayIsoStr = todayIso();
  const todayJalali = useMemo(() => isoToJalali(todayIsoStr), [todayIsoStr]);
  const [jy, setJy] = useState<number>(todayJalali.jy);
  const [jm, setJm] = useState<number>(todayJalali.jm);

  // Build the Jalali month grid first so we can derive the exact Gregorian
  // date range the displayed Jalali month occupies (a Jalali month spans two
  // Gregorian months, e.g. Khordad ≈ 22 May–21 June). The backend aggregates
  // over this explicit range rather than a single Gregorian year/month.
  const cells = useMemo(() => buildJalaliMonthGrid(jy, jm), [jy, jm]);

  // Inclusive [from, to] Gregorian "YYYY-MM-DD" of the in-month cells.
  const { rangeFrom, rangeTo } = useMemo(() => {
    const inMonth = cells.filter((c) => c.inCurrentMonth);
    if (inMonth.length === 0) {
      return { rangeFrom: undefined, rangeTo: undefined };
    }
    const isos = inMonth.map((c) => c.iso).sort();
    return { rangeFrom: isos[0], rangeTo: isos[isos.length - 1] };
  }, [cells]);

  const { data: monthly, isLoading, isError, error, refetch } =
    useMyMonthlyAppointmentsByRange(rangeFrom, rangeTo);

  const { openDrawer, closeDrawer } = usePanelDrawer();

  function openDayDetails(iso: string) {
    openDrawer({
      title: formatJalaliLabel(iso, "long"),
      description: "جزئیات نوبت‌های این روز",
      content: (
        <CalendarDayDetails
          date={iso}
          onGotoTimeline={() => {
            closeDrawer();
            router.push(`/reception/timeline?date=${iso}`);
          }}
        />
      ),
    });
  }

  /**
   * Index the per-day summaries by Gregorian "YYYY-MM-DD" for O(1) cell lookup.
   * The backend `date` may arrive as a full ISO timestamp, so we normalize to
   * the first 10 characters ("YYYY-MM-DD") to match `cell.iso`.
   */
  const summaryByDate = useMemo(() => {
    const map = new Map<string, MonthlyAppointmentSummary>();
    monthly?.forEach((s) => {
      const key = (s.date ?? "").slice(0, 10);
      if (key) map.set(key, s);
    });
    return map;
  }, [monthly]);

  /** Move the grid to the previous Jalali month. */
  function prevMonth() {
    if (jm === 1) {
      setJy((y) => y - 1);
      setJm(12);
    } else {
      setJm((m) => m - 1);
    }
  }

  /** Move the grid to the next Jalali month. */
  function nextMonth() {
    if (jm === 12) {
      setJy((y) => y + 1);
      setJm(1);
    } else {
      setJm((m) => m + 1);
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">تقویم ماهانه</h1>
          </div>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Stethoscope className="size-4" />
            نمای کلی نوبت‌های پزشک
          </p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth} aria-label="ماه قبل">
            <ChevronRight className="size-4" />
          </Button>
          <span className="min-w-32 text-center text-lg font-semibold">
            {JALALI_MONTH_NAMES[jm - 1]} {toPersianDigits(jy)}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth} aria-label="ماه بعد">
            <ChevronLeft className="size-4" />
          </Button>
        </div>
      </div>

      {/* Calendar */}
      {isLoading ? (
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-lg" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">بارگذاری تقویم ممکن نشد.</p>
              <p className="text-sm text-muted-foreground">
                {(error as Error)?.message ?? "لطفاً دوباره تلاش کنید."}
              </p>
            </div>
            <Button variant="outline" onClick={() => refetch()}>
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Weekday header row */}
          <div className="grid grid-cols-7 gap-1.5">
            {JALALI_WEEKDAYS.map((d) => (
              <div
                key={d}
                className="py-1 text-center text-xs font-medium text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((cell) => {
              const summary = summaryByDate.get(cell.iso);
              const total = summary?.total ?? 0;
              const isToday = cell.iso === todayIsoStr;
              const isPast = cell.iso < todayIsoStr;
              const tooltip = summary ? buildDayTooltip(summary) : "";
              return (
                <div key={cell.iso} className="group relative">
                  <button
                    type="button"
                    onClick={() => openDayDetails(cell.iso)}
                    title={tooltip}
                    className={cn(
                      "relative flex aspect-square w-full flex-col items-center justify-between rounded-lg border p-1.5 text-center transition-colors hover:border-primary hover:bg-primary/5",
                      !cell.inCurrentMonth && "opacity-40",
                      isPast && cell.inCurrentMonth && "bg-muted/30",
                      isToday && "border-primary ring-1 ring-primary",
                      // Days that have appointments get a distinct background tint,
                      // a colored border and a subtle primary glow so they stand out
                      // from empty days at a glance.
                      total > 0 &&
                        !isPast &&
                        "border-primary/40 bg-primary/5 shadow-sm",
                      total > 0 &&
                        isPast &&
                        "border-primary/30 bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "text-sm font-semibold",
                        isToday && "text-primary",
                      )}
                    >
                      {toPersianDigits(cell.jd)}
                    </span>

                    {total > 0 && summary ? (
                      <>
                        {/* Status breakdown bar — thin, at the bottom of the cell */}
                        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
                          {statusSegments.map((seg) => {
                            const count = summary[seg.key];
                            if (!count) return null;
                            return (
                              <span
                                key={seg.key}
                                className={cn("h-full", seg.className)}
                                style={{ flexGrow: count }}
                              />
                            );
                          })}
                        </div>
                        {/* Compact count badge — color reflects the day's
                            dominant status so a glance shows the activity type. */}
                        <span
                          aria-label={`${toPersianDigits(total)} نوبت`}
                          className={cn(
                            "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none tabular-nums shadow-sm",
                            dominantBadgeClass(summary),
                          )}
                        >
                          {toPersianDigits(total)}
                        </span>
                      </>
                    ) : (
                      <span className="h-1.5 w-full" />
                    )}
                  </button>

                  {/* CSS hover tooltip — appears on hover for days with appointments */}
                  {tooltip ? (
                    <div
                      role="tooltip"
                      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 hidden w-max max-w-[14rem] -translate-x-1/2 rounded-md border bg-popover px-3 py-2 text-center text-xs text-popover-foreground shadow-md group-hover:block"
                    >
                      {tooltip}
                      <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-popover" />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            {[
              { label: "تکمیل‌شده", className: "bg-green-500" },
              { label: "تأییدشده", className: "bg-blue-500" },
              { label: "در انتظار تأیید منشی", className: "bg-yellow-500" },
              { label: "حاضر در مطب", className: "bg-sky-500" },
              { label: "فراخوان‌شده", className: "bg-violet-500" },
              { label: "در حال ویزیت", className: "bg-purple-500" },
              { label: "عدم مراجعه", className: "bg-red-500" },
              { label: "لغوشده", className: "bg-zinc-400" },
            ].map((item) => (
              <span key={item.label} className="flex items-center gap-1.5">
                <span className={cn("size-2.5 rounded-full", item.className)} />
                {item.label}
              </span>
            ))}
          </div>
        </>
      )}

    </div>
  );
}

function CalendarDayDetails({
  date,
  onGotoTimeline,
}: {
  date: string;
  onGotoTimeline: () => void;
}) {
  const {
    data: timeline,
    isLoading,
    isError,
    error,
    refetch,
  } = useMyDailyTimeline(date);

  const appointments = useMemo(() => {
    return [...(timeline?.appointments ?? [])]
      .map((a) => ({
        ...a,
        start_time: toHHmm(a.start_time),
        end_time: toHHmm(a.end_time),
      }))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [timeline]);

  return (
    <div className="flex flex-col gap-4">
      <div className="max-h-[55vh] overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="flex flex-col gap-1">
              <p className="font-medium">بارگذاری نوبت‌ها ممکن نشد.</p>
              <p className="text-sm text-muted-foreground">
                {(error as Error)?.message ?? "لطفاً دوباره تلاش کنید."}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-4" />
              تلاش مجدد
            </Button>
          </div>
        ) : appointments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="font-medium">هیچ نوبتی برای این روز ثبت نشده است.</p>
          </div>
        ) : (
          <ol className="flex flex-col gap-2">
            {appointments.map((apt, idx) => {
              const cfg = statusConfig[apt.status] ?? {
                label: apt.status,
                dot: "bg-zinc-400",
                badge:
                  "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-300",
              };
              const pay =
                paymentConfig[apt.payment_status] ?? paymentConfig.UNPAID;
              const name =
                apt.patient_name?.trim() ||
                apt.patient_phone?.trim() ||
                "بیمار بدون نام";
              const phone = apt.patient_phone?.trim();
              return (
                <li
                  key={apt.id}
                  className="rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4" />
                      <span className="font-medium tabular-nums">
                        {toPersianDigits(apt.start_time)} –{" "}
                        {toPersianDigits(apt.end_time)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (نوبت {toPersianDigits(idx + 1)})
                      </span>
                    </div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                        cfg.badge,
                      )}
                    >
                      <span className={cn("size-2 rounded-full", cfg.dot)} />
                      {cfg.label}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-muted-foreground" />
                      <span className="font-medium">{name}</span>
                    </div>
                    {phone ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                        <Phone className="size-3.5" />
                        {toPersianDigits(phone)}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-2">
                    <Badge variant="outline" className={pay.className}>
                      {pay.label}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <Button variant="outline" className="w-full" onClick={onGotoTimeline}>
        مشاهده تایم‌لاین کامل
      </Button>
    </div>
  );
}
