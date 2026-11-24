"use client";

/**
 * Reception — Daily Doctor Timeline.
 *
 * Route: `/reception/timeline`.
 *
 * Renders the doctor's day as a vertical timeline of appointments with a
 * horizontal shift-range bar at the top and a live "current time" indicator
 * when viewing today. The date defaults to today but can be supplied via the
 * `?date=YYYY-MM-DD` query param (the monthly calendar links here).
 *
 * All copy is Persian and the layout is RTL.
 */

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  Clock,
  Loader2,
  RefreshCw,
  Stethoscope,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatJalaliLabel, toPersianDigits } from "@/lib/jalali";
import { useMyDailyTimeline } from "@/hooks/useBooking";
import type { AppointmentStatus, TimelineShiftInfo } from "@/types/booking";

/** Today's date as `"YYYY-MM-DD"` (UTC, matches the backend's expectation). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Status → styling config used by every appointment badge in the timeline.
 * Appointments only carry the real lifecycle statuses.
 */
const statusConfig: Record<
  AppointmentStatus,
  { label: string; dot: string; bar: string; text: string }
> = {
  PENDING: {
    label: "در انتظار تأیید منشی",
    dot: "bg-yellow-500",
    bar: "border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30",
    text: "text-yellow-700 dark:text-yellow-300",
  },
  CONFIRMED: {
    label: "تأییدشده",
    dot: "bg-blue-500",
    bar: "border-blue-300 bg-blue-50 dark:bg-blue-950/30",
    text: "text-blue-700 dark:text-blue-300",
  },
  CHECKED_IN: {
    label: "حاضر در مطب",
    dot: "bg-sky-500",
    bar: "border-sky-300 bg-sky-50 dark:bg-sky-950/30",
    text: "text-sky-700 dark:text-sky-300",
  },
  CALLED: {
    label: "فراخوان‌شده",
    dot: "bg-violet-500",
    bar: "border-violet-300 bg-violet-50 dark:bg-violet-950/30",
    text: "text-violet-700 dark:text-violet-300",
  },
  IN_PROGRESS: {
    label: "در حال ویزیت",
    dot: "bg-purple-500",
    bar: "border-purple-300 bg-purple-50 dark:bg-purple-950/30",
    text: "text-purple-700 dark:text-purple-300",
  },
  COMPLETED: {
    label: "تکمیل‌شده",
    dot: "bg-green-500",
    bar: "border-green-300 bg-green-50 dark:bg-green-950/30",
    text: "text-green-700 dark:text-green-300",
  },
  CANCELLED: {
    label: "لغوشده",
    dot: "bg-zinc-400",
    bar: "border-zinc-200 bg-zinc-50 dark:bg-zinc-900/40",
    text: "text-zinc-500 dark:text-zinc-400",
  },
  NO_SHOW: {
    label: "عدم مراجعه",
    dot: "bg-red-500",
    bar: "border-red-300 bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
  },
};

/** Pulsing LIVE badge shown near the page header. */
function LiveBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-400">
      <span className="relative flex size-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-red-500" />
      </span>
      زنده
    </span>
  );
}

/**
 * Normalize a time value to `"HH:mm"`.
 *
 * The timeline endpoint returns `start_time`/`end_time` as full ISO timestamps
 * (`time.Time` serialized, e.g. `"2026-07-01T09:00:00Z"`), but the page renders
 * and sorts on wall-clock `"HH:mm"`. Values already in `"HH:mm"` form (no `"T"`)
 * are passed through unchanged. ISO values are converted to Tehran local time
 * (fixed UTC+03:30; Iran abolished DST in 2022), matching the schedule
 * endpoint's server-side formatting.
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

/** Parse an `"HH:mm"` string into minutes since midnight. Returns 0 if invalid. */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/** Current time as `"HH:mm"`. */
function nowHM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** A horizontal shift-range bar visualizing the active working window. */
function ShiftBar({
  shift,
  earliest,
  latest,
}: {
  shift: TimelineShiftInfo;
  earliest: number;
  latest: number;
}) {
  const span = Math.max(latest - earliest, 1);
  const startMin = timeToMinutes(shift.start_time);
  const endMin = timeToMinutes(shift.end_time);
  const leftPct = ((startMin - earliest) / span) * 100;
  const widthPct = ((endMin - startMin) / span) * 100;
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-xs text-muted-foreground tabular-nums">
        {toPersianDigits(shift.start_time)} – {toPersianDigits(shift.end_time)}
      </span>
      <div className="relative h-3 flex-1 rounded-full bg-muted">
        <div
          className={cn(
            "absolute top-0 h-3 rounded-full",
            shift.is_active ? "bg-primary" : "bg-muted-foreground/40",
          )}
          style={{
            insetInlineStart: `${leftPct}%`,
            width: `${Math.max(widthPct, 1)}%`,
          }}
        />
      </div>
      <Badge variant="outline" className="shrink-0">
        {shift.is_active ? "فعال" : "غیرفعال"}
      </Badge>
    </div>
  );
}

function TimelineContent() {
  const searchParams = useSearchParams();

  const [date, setDate] = useState<string>(
    searchParams.get("date") || todayISO(),
  );

  // The doctor is resolved server-side from the JWT via the "me" endpoint: a
  // receptionist is transparently mapped to their employer doctor, so the
  // client never needs to know the doctor id (which the /me/schedule response
  // does not return, causing the previous empty-state bug).
  const {
    data: timeline,
    isLoading,
    isFetching: timelineFetching,
    isError: timelineError,
    error: timelineErr,
    refetch: refetchTimeline,
  } = useMyDailyTimeline(date);

  const isToday = date === todayISO();

  /** Normalize times to "HH:mm", sort appointments and compute the day's span. */
  const { appointments, shifts, earliest, latest } = useMemo(() => {
    const items = [...(timeline?.appointments ?? [])]
      .map((a) => ({
        ...a,
        start_time: toHHmm(a.start_time),
        end_time: toHHmm(a.end_time),
      }))
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
    const shiftList = (timeline?.shifts ?? []).map((s) => ({
      ...s,
      start_time: toHHmm(s.start_time),
      end_time: toHHmm(s.end_time),
    }));
    const times: number[] = [];
    items.forEach((a) => {
      times.push(timeToMinutes(a.start_time));
      times.push(timeToMinutes(a.end_time));
    });
    shiftList.forEach((s) => {
      times.push(timeToMinutes(s.start_time));
      times.push(timeToMinutes(s.end_time));
    });
    const earliest = times.length ? Math.min(...times) : 8 * 60;
    const latest = times.length ? Math.max(...times) : 20 * 60;
    return { appointments: items, shifts: shiftList, earliest, latest };
  }, [timeline]);

  const nowMinutes = timeToMinutes(nowHM());
  const showNowLine =
    isToday && nowMinutes >= earliest && nowMinutes <= latest;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">خط زمانی روزانه</h1>
            <LiveBadge />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatJalaliLabel(date, "full")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-1">
            <JalaliDatePicker
              id="timeline-date"
              value={date}
              onChange={(iso) => setDate(iso || todayISO())}
              className="w-44"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => refetchTimeline()}
            disabled={timelineFetching}
            aria-label="بازخوانی"
          >
            <RefreshCw
              className={cn("size-4", timelineFetching && "animate-spin")}
            />
            بازخوانی
          </Button>
        </div>
      </div>

      {/* Shift range bars */}
      {shifts.length > 0 ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Stethoscope className="size-4" />
              شیفت‌ها
            </h2>
            {shifts.map((shift) => (
              <ShiftBar
                key={shift.id}
                shift={shift}
                earliest={earliest}
                latest={latest}
              />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Timeline */}
      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : timelineError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">بارگذاری خط زمانی ممکن نشد.</p>
              <p className="text-sm text-muted-foreground">
                {(timelineErr as Error)?.message ?? "لطفاً دوباره تلاش کنید."}
              </p>
            </div>
            <Button variant="outline" onClick={() => refetchTimeline()}>
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      ) : appointments.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="font-medium">هیچ نوبتی برای این تاریخ وجود ندارد.</p>
            <p className="text-sm text-muted-foreground">
              خط زمانی این روز خالی است.
            </p>
          </CardContent>
        </Card>
      ) : (
        <section className="relative space-y-1">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <Clock className="size-5 text-primary" />
            رویدادهای روز
          </h2>

          <ol className="relative space-y-3 pr-5">
            {/* Connecting vertical line */}
            <span className="absolute bottom-2 top-2 right-[7px] w-px bg-border" />

            {/* Current time indicator */}
            {showNowLine ? (
              <div className="pointer-events-none absolute right-0 left-0 z-10 flex items-center">
                <span className="relative h-0.5 w-full bg-red-500">
                  <span className="absolute -top-2 right-0 rounded bg-red-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                    اکنون · {toPersianDigits(nowHM())}
                  </span>
                </span>
              </div>
            ) : null}

            {appointments.map((apt, idx) => {
              const cfg = statusConfig[apt.status] ?? {
                label: apt.status,
                dot: "bg-zinc-400",
                bar: "border-zinc-200 bg-muted",
                text: "",
              };
              const isPast =
                timeToMinutes(apt.end_time) < nowMinutes && isToday;
              return (
                <li
                  key={apt.id}
                  className={cn(
                    "relative rounded-lg border p-3 transition-colors",
                    cfg.bar,
                    isPast && "opacity-60",
                  )}
                >
                  {/* Node on the connecting line */}
                  <span
                    className={cn(
                      "absolute -right-[18px] top-4 size-3.5 rounded-full ring-4 ring-background",
                      cfg.dot,
                    )}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Clock className="size-4 text-muted-foreground" />
                      <span className="font-medium tabular-nums">
                        {toPersianDigits(apt.start_time)} –{" "}
                        {toPersianDigits(apt.end_time)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        (نوبت {toPersianDigits(idx + 1)})
                      </span>
                    </div>
                    <Badge variant="outline" className={cfg.text}>
                      {cfg.label}
                    </Badge>
                  </div>
                  <div className="mt-2 flex items-center gap-2">
                    <Users className="size-4 text-muted-foreground" />
                    <span className="text-sm">
                      شناسهٔ بیمار:{" "}
                      <span className="font-medium tabular-nums">
                        {apt.patient_id}
                      </span>
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}
    </div>
  );
}

export default function TimelinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TimelineContent />
    </Suspense>
  );
}
