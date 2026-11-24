"use client";

/**
 * Doctor — Home Dashboard.
 *
 * Route: `/doctor/dashboard`.
 *
 * Operational overview for the signed-in physician: today's queue KPIs,
 * next appointments, earnings/wallet snapshot, upcoming shifts, and quick
 * links into the rest of the doctor panel. All widgets use real hooks —
 * schedule, finance, shifts, and leaves — with graceful loading/error/empty
 * states (no hardcoded demo data).
 */

import { useMemo } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  CalendarOff,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PlayCircle,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PanelPageHeader,
  PanelStatCard,
} from "@/components/shared/panel/PanelKit";
import {
  useDoctorEarnings,
  useDoctorSchedule,
  useDoctorWallet,
} from "@/hooks/useDoctorPortal";
import { useDoctorShifts } from "@/hooks/useDoctorShifts";
import { useLeaves } from "@/hooks/useLeaves";
import { formatJalaliLabel, todayIso, toPersianDigits } from "@/lib/jalali";
import { cn, formatToman } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import { fullName } from "@/types/auth";
import type { DoctorScheduleItem } from "@/types/doctor-portal";
import type { Leave, Shift } from "@/types/schedule";

/** First day of the current Gregorian month as `"YYYY-MM-DD"`. */
function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Compact Persian status labels for the schedule preview. */
const STATUS_LABEL: Partial<Record<DoctorScheduleItem["status"], string>> = {
  WAITING: "در انتظار",
  PENDING: "در انتظار تأیید",
  CONFIRMED: "تأییدشده",
  CHECKED_IN: "حاضر در مطب",
  CALLED: "فراخوان‌شده",
  IN_ROOM: "فراخوان‌شده",
  IN_PROGRESS: "در حال ویزیت",
  COMPLETED: "تکمیل‌شده",
  NO_SHOW: "عدم مراجعه",
  CANCELLED: "لغوشده",
};

const STATUS_TONE: Partial<Record<DoctorScheduleItem["status"], string>> = {
  WAITING: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  PENDING:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200",
  CONFIRMED: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  CHECKED_IN: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  CALLED:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  IN_ROOM:
    "bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  IN_PROGRESS:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  COMPLETED:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  NO_SHOW: "bg-destructive/10 text-destructive",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** Appointments still relevant on today's operational board. */
const ACTIVE_STATUSES = new Set<DoctorScheduleItem["status"]>([
  "WAITING",
  "PENDING",
  "CONFIRMED",
  "CHECKED_IN",
  "CALLED",
  "IN_ROOM",
  "IN_PROGRESS",
]);

const QUICK_ACTIONS = [
  {
    href: "/doctor/queue",
    label: "صف بیماران",
    description: "ویزیت‌های امروز",
    icon: ClipboardList,
  },
  {
    href: "/doctor/patients",
    label: "بیماران من",
    description: "پرونده و سوابق",
    icon: Users,
  },
  {
    href: "/doctor/prescriptions",
    label: "نسخه‌ها",
    description: "نگارش و تاریخچه",
    icon: FileText,
  },
  {
    href: "/doctor/shifts",
    label: "برنامه کاری",
    description: "شیفت و تنظیمات",
    icon: CalendarDays,
  },
  {
    href: "/doctor/earnings",
    label: "درآمد",
    description: "کیف پول و گزارش",
    icon: Wallet,
  },
  {
    href: "/doctor/leaves",
    label: "مرخصی‌ها",
    description: "ثبت و مدیریت",
    icon: CalendarOff,
  },
] as const;

export default function DoctorDashboardPage() {
  const user = useAuthStore((s) => s.user);
  const doctorId = user?.id ?? "";
  const today = todayIso();
  const monthStart = startOfMonthISO();

  const scheduleQuery = useDoctorSchedule(today);
  const earningsQuery = useDoctorEarnings({ from: monthStart, to: today });
  const walletQuery = useDoctorWallet();
  const shiftsQuery = useDoctorShifts(doctorId);
  const leavesQuery = useLeaves(doctorId);

  const items = useMemo(
    () => scheduleQuery.data?.items ?? [],
    [scheduleQuery.data],
  );

  const queueStats = useMemo(() => {
    const total = items.length;
    const waiting = items.filter(
      (i) =>
        i.status === "CALLED" ||
        i.status === "IN_ROOM" ||
        i.status === "CHECKED_IN" ||
        i.status === "WAITING" ||
        i.status === "CONFIRMED",
    ).length;
    const inProgress = items.filter((i) => i.status === "IN_PROGRESS").length;
    const completed = items.filter((i) => i.status === "COMPLETED").length;
    return { total, waiting, inProgress, completed };
  }, [items]);

  const upcomingAppointments = useMemo(() => {
    return [...items]
      .filter((i) => ACTIVE_STATUSES.has(i.status))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .slice(0, 6);
  }, [items]);

  const upcomingShifts = useMemo(() => {
    return [...(shiftsQuery.data ?? [])]
      .filter((s) => s.date >= today && s.is_active !== false)
      .sort((a, b) => {
        const da = `${a.date} ${a.start_time}`;
        const db = `${b.date} ${b.start_time}`;
        return da.localeCompare(db);
      })
      .slice(0, 5);
  }, [shiftsQuery.data, today]);

  const upcomingLeaves = useMemo(() => {
    return [...(leavesQuery.data ?? [])]
      .filter((l) => (l.end_date ?? "") >= today)
      .sort((a, b) => (a.start_date ?? "").localeCompare(b.start_date ?? ""))
      .slice(0, 3);
  }, [leavesQuery.data, today]);

  const displayName = user ? fullName(user) : "";
  const greeting = displayName
    ? `سلام دکتر ${displayName}`
    : "داشبورد پزشک";

  return (
    <div className="space-y-6">
      <PanelPageHeader
        title={greeting}
        subtitle={formatJalaliLabel(today, "long")}
        icon={LayoutDashboard}
        tone="brand"
        actions={
          <Link
            href="/doctor/queue"
            className={buttonVariants({ size: "sm" })}
          >
            صف زنده
            <ArrowLeft className="size-4" />
          </Link>
        }
      />

      {/* Today's queue KPIs */}
      <section aria-labelledby="today-kpis-heading" className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2
            id="today-kpis-heading"
            className="text-sm font-semibold text-foreground"
          >
            وضعیت امروز
          </h2>
          <Link
            href="/doctor/queue"
            className="text-xs font-medium text-brand hover:underline"
          >
            مشاهده صف
          </Link>
        </div>
        {scheduleQuery.isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-[76px] w-full rounded-xl" />
            ))}
          </div>
        ) : scheduleQuery.isError ? (
          <ErrorPanel
            message="بارگذاری وضعیت امروز ممکن نشد."
            detail={(scheduleQuery.error as Error)?.message}
            onRetry={() => scheduleQuery.refetch()}
          />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <PanelStatCard
              icon={ClipboardList}
              label="کل نوبت‌ها"
              value={toPersianDigits(queueStats.total)}
              tone="brand"
            />
            <PanelStatCard
              icon={Users}
              label="در صف"
              value={toPersianDigits(queueStats.waiting)}
              tone="info"
            />
            <PanelStatCard
              icon={PlayCircle}
              label="در حال ویزیت"
              value={toPersianDigits(queueStats.inProgress)}
              tone="gold"
            />
            <PanelStatCard
              icon={UserCheck}
              label="تکمیل‌شده"
              value={toPersianDigits(queueStats.completed)}
              tone="success"
            />
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Today's schedule preview */}
        <section
          aria-labelledby="schedule-heading"
          className="space-y-3 lg:col-span-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="schedule-heading"
              className="text-sm font-semibold text-foreground"
            >
              نوبت‌های پیش‌رو امروز
            </h2>
            <Link
              href="/doctor/queue"
              className="text-xs font-medium text-brand hover:underline"
            >
              همه
            </Link>
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              {scheduleQuery.isLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-xl" />
                  ))}
                </div>
              ) : scheduleQuery.isError ? (
                <div className="p-4">
                  <ErrorPanel
                    message="بارگذاری نوبت‌ها ممکن نشد."
                    detail={(scheduleQuery.error as Error)?.message}
                    onRetry={() => scheduleQuery.refetch()}
                  />
                </div>
              ) : upcomingAppointments.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="نوبت فعالی برای امروز نیست"
                  description="وقتی بیمار در صف باشد، اینجا نمایش داده می‌شود."
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {upcomingAppointments.map((item) => (
                    <AppointmentRow key={item.appointment_id} item={item} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Earnings snapshot */}
        <section
          aria-labelledby="earnings-heading"
          className="space-y-3 lg:col-span-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h2
              id="earnings-heading"
              className="text-sm font-semibold text-foreground"
            >
              خلاصه درآمد
            </h2>
            <Link
              href="/doctor/earnings"
              className="text-xs font-medium text-brand hover:underline"
            >
              جزئیات
            </Link>
          </div>
          <Card>
            <CardContent className="space-y-4 p-4">
              {walletQuery.isLoading || earningsQuery.isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-10 w-2/3" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : walletQuery.isError && earningsQuery.isError ? (
                <ErrorPanel
                  message="بارگذاری درآمد ممکن نشد."
                  detail={
                    (earningsQuery.error as Error)?.message ??
                    (walletQuery.error as Error)?.message
                  }
                  onRetry={() => {
                    void walletQuery.refetch();
                    void earningsQuery.refetch();
                  }}
                />
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <Wallet className="size-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        موجودی کیف پول
                      </p>
                      <p className="text-xl font-bold tabular-nums">
                        {walletQuery.isError
                          ? "—"
                          : formatToman(walletQuery.data?.balance ?? 0)}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2.5 border-t border-border/60 pt-4">
                    <EarningsLine
                      label="تسویه‌شده این ماه"
                      value={
                        earningsQuery.isError
                          ? "—"
                          : formatToman(earningsQuery.data?.doctor_share ?? 0)
                      }
                    />
                    <EarningsLine
                      label="ویزیت‌های تسویه‌شده"
                      value={
                        earningsQuery.isError
                          ? "—"
                          : toPersianDigits(
                              earningsQuery.data?.total_completed ?? 0,
                            )
                      }
                    />
                    <EarningsLine
                      label="در انتظار تسویه"
                      value={
                        earningsQuery.isError
                          ? "—"
                          : formatToman(
                              earningsQuery.data?.pending_settlement ?? 0,
                            )
                      }
                      hint={
                        (earningsQuery.data?.pending_count ?? 0) > 0
                          ? `${toPersianDigits(earningsQuery.data!.pending_count)} نوبت`
                          : undefined
                      }
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Upcoming shifts */}
        <section aria-labelledby="shifts-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="shifts-heading"
              className="text-sm font-semibold text-foreground"
            >
              شیفت‌های پیش‌رو
            </h2>
            <Link
              href="/doctor/shifts"
              className="text-xs font-medium text-brand hover:underline"
            >
              مدیریت
            </Link>
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              {shiftsQuery.isLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              ) : shiftsQuery.isError ? (
                <div className="p-4">
                  <ErrorPanel
                    message="بارگذاری شیفت‌ها ممکن نشد."
                    detail={(shiftsQuery.error as Error)?.message}
                    onRetry={() => shiftsQuery.refetch()}
                  />
                </div>
              ) : upcomingShifts.length === 0 ? (
                <EmptyState
                  icon={CalendarDays}
                  title="شیفت فعالی ثبت نشده"
                  description="از صفحهٔ برنامه کاری شیفت جدید اضافه کنید."
                  actionHref="/doctor/shifts"
                  actionLabel="افزودن شیفت"
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {upcomingShifts.map((shift) => (
                    <ShiftRow key={shift.id} shift={shift} today={today} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>

        {/* Upcoming leaves */}
        <section aria-labelledby="leaves-heading" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2
              id="leaves-heading"
              className="text-sm font-semibold text-foreground"
            >
              مرخصی‌های پیش‌رو
            </h2>
            <Link
              href="/doctor/leaves"
              className="text-xs font-medium text-brand hover:underline"
            >
              مدیریت
            </Link>
          </div>
          <Card className="gap-0 py-0">
            <CardContent className="p-0">
              {leavesQuery.isLoading ? (
                <div className="space-y-3 p-4">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-xl" />
                  ))}
                </div>
              ) : leavesQuery.isError ? (
                <div className="p-4">
                  <ErrorPanel
                    message="بارگذاری مرخصی‌ها ممکن نشد."
                    detail={(leavesQuery.error as Error)?.message}
                    onRetry={() => leavesQuery.refetch()}
                  />
                </div>
              ) : upcomingLeaves.length === 0 ? (
                <EmptyState
                  icon={CalendarOff}
                  title="مرخصی پیش‌رویی نیست"
                  description="در صورت نیاز می‌توانید مرخصی ثبت کنید."
                />
              ) : (
                <ul className="divide-y divide-border/60">
                  {upcomingLeaves.map((leave) => (
                    <LeaveRow key={leave.id} leave={leave} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </section>
      </div>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-heading" className="space-y-3">
        <h2
          id="quick-actions-heading"
          className="text-sm font-semibold text-foreground"
        >
          دسترسی سریع
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {QUICK_ACTIONS.map(({ href, label, description, icon: Icon }) => (
            <Link key={href} href={href} className="block">
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardContent className="p-4">
                  <span className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <p className="text-sm font-semibold text-foreground">
                    {label}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {description}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row / helper components                                                   */
/* -------------------------------------------------------------------------- */

function AppointmentRow({ item }: { item: DoctorScheduleItem }) {
  const label = STATUS_LABEL[item.status] ?? item.status;
  const tone = STATUS_TONE[item.status] ?? "bg-muted text-muted-foreground";
  const ehrHref = `/doctor/patients/${item.patient_id}/ehr?appointment=${item.appointment_id}`;

  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <div className="w-16 shrink-0 text-center">
        <p className="text-sm font-semibold tabular-nums text-foreground">
          {toPersianDigits(item.start_time)}
        </p>
        <p className="text-[11px] tabular-nums text-muted-foreground">
          {toPersianDigits(item.end_time)}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium text-foreground">
            {item.patient_name || "—"}
          </p>
          <Badge
            variant="outline"
            className={cn("border-transparent text-[11px]", tone)}
          >
            {label}
          </Badge>
        </div>
        {item.reason ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {item.reason}
          </p>
        ) : null}
      </div>
      <Link
        href={ehrHref}
        aria-label={`پرونده ${item.patient_name}`}
        className={cn(
          buttonVariants({ size: "sm", variant: "ghost" }),
          "shrink-0",
        )}
      >
        <FileText className="size-4" />
        <span className="hidden sm:inline">پرونده</span>
      </Link>
    </li>
  );
}

function ShiftRow({ shift, today }: { shift: Shift; today: string }) {
  const isToday = shift.date === today;
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">
            {formatJalaliLabel(shift.date, "day")}
          </p>
          {isToday ? (
            <Badge
              variant="outline"
              className="border-transparent bg-brand/12 text-[11px] text-brand"
            >
              امروز
            </Badge>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {toPersianDigits(shift.start_time)} –{" "}
          {toPersianDigits(shift.end_time)}
        </p>
      </div>
      <p className="shrink-0 text-xs text-muted-foreground">
        ظرفیت {toPersianDigits(shift.max_patients)}
      </p>
    </li>
  );
}

function LeaveRow({ leave }: { leave: Leave }) {
  const sameDay = leave.start_date === leave.end_date;
  return (
    <li className="flex items-start justify-between gap-3 px-4 py-3 sm:px-5">
      <div className="min-w-0">
        <p className="font-medium text-foreground">
          {sameDay
            ? formatJalaliLabel(leave.start_date, "full")
            : `${formatJalaliLabel(leave.start_date, "short")} تا ${formatJalaliLabel(leave.end_date, "short")}`}
        </p>
        {leave.reason ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {leave.reason}
          </p>
        ) : null}
      </div>
      {leave.status ? (
        <Badge variant="outline" className="shrink-0 text-[11px]">
          {leave.status === "approved"
            ? "تأییدشده"
            : leave.status === "pending"
              ? "در انتظار"
              : leave.status === "rejected"
                ? "ردشده"
                : leave.status}
        </Badge>
      ) : null}
    </li>
  );
}

function EarningsLine({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-end">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {value}
        </span>
        {hint ? (
          <span className="ms-1.5 text-[11px] text-muted-foreground">
            ({hint})
          </span>
        ) : null}
      </span>
    </div>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
      <Icon className="size-8 text-muted-foreground" />
      <p className="font-medium text-foreground">{title}</p>
      <p className="max-w-xs text-sm text-muted-foreground">{description}</p>
      {actionHref && actionLabel ? (
        <Link
          href={actionHref}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }), "mt-2")}
        >
          {actionLabel}
        </Link>
      ) : null}
    </div>
  );
}

function ErrorPanel({
  message,
  detail,
  onRetry,
}: {
  message: string;
  detail?: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <AlertCircle className="size-7 text-destructive" />
      <div className="space-y-1">
        <p className="font-medium">{message}</p>
        {detail ? (
          <p className="text-sm text-muted-foreground">{detail}</p>
        ) : null}
      </div>
      <Button variant="outline" size="sm" onClick={onRetry}>
        تلاش مجدد
      </Button>
    </div>
  );
}
