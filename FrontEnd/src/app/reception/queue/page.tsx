"use client";

/**
 * Reception — Live Queue / Waiting Room dashboard.
 *
 * Route: `/reception/queue`.
 *
 * The receptionist's primary workspace. It pulls the assigned doctor's daily
 * schedule (doctor-scoped token, so the same `GET /doctors/me/schedule` the
 * doctor portal uses works here too) and renders three sections:
 *
 *  1. **Today's Queue** — every appointment with status + per-row actions
 *     (تأیید / حاضر در مطب / فراخوان / عدم مراجعه / تسویه / کنسل).
 *     Start/complete visit live on the doctor queue.
 *  2. **Waiting List** — patients queued for the same doctor/date.
 *  3. **Quick Registration** — a dialog that adds a walk-in/phone patient to
 *     the waiting list.
 *
 * The queue auto-refreshes every 15s and shows a pulsing "زنده" (LIVE) badge.
 * All copy is Persian, the layout is RTL, and the table degrades to cards on
 * mobile.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarClock,
  ClipboardList,
  Clock,
  DoorOpen,
  Hourglass,
  Loader2,
  RefreshCw,
  Stethoscope,
  UserCheck,
  UserX,
  Users,
  CheckCircle2,
  XCircle,
  Zap,
} from "lucide-react";

import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { formatJalaliLabel } from "@/lib/jalali";
import { QuickRegisterForm } from "./_components/QuickRegisterForm";
import { useAuthStore } from "@/store/authStore";
import { useDoctorSchedule } from "@/hooks/useDoctorPortal";
import {
  useCallPatient,
  useCheckIn,
  useConfirmAppointment,
  useConvertWaitingEntry,
  useMarkNoShow,
  useWaitingList,
} from "@/hooks/useBooking";
import { useSettlePayment, useCancelPayment } from "@/hooks/useFinance";
import { VisitTimer } from "./_components/VisitTimer";
import type { DoctorScheduleItem } from "@/types/doctor-portal";
import type {
  WaitingEntryType,
  WaitingListEntry,
  WaitingListEntryStatus,
} from "@/types/booking";

/** Auto-refresh interval for the live queue (15 seconds). */
const REFRESH_INTERVAL_MS = 15_000;

/** Today's date as `"YYYY-MM-DD"` (UTC, matches the backend's expectation). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Status → styling config used by every appointment badge in the queue. */
const statusConfig: Record<
  DoctorScheduleItem["status"],
  { label: string; variant: "default" | "secondary" | "destructive" | "outline"; className?: string }
> = {
  WAITING: { label: "در انتظار", variant: "default" },
  PENDING: {
    label: "در انتظار تأیید منشی",
    variant: "outline",
    className:
      "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-200",
  },
  CONFIRMED: {
    label: "تأییدشده",
    variant: "outline",
    className:
      "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  },
  CHECKED_IN: {
    label: "حاضر در مطب",
    variant: "outline",
    className:
      "border-transparent bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200",
  },
  CALLED: {
    label: "فراخوان‌شده",
    variant: "outline",
    className:
      "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  },
  IN_ROOM: {
    label: "فراخوان‌شده",
    variant: "outline",
    className:
      "border-transparent bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200",
  },
  IN_PROGRESS: {
    label: "در حال ویزیت",
    variant: "outline",
    className:
      "border-transparent bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  },
  COMPLETED: {
    label: "تکمیل‌شده",
    variant: "outline",
    className:
      "border-transparent bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
  },
  NO_SHOW: { label: "عدم مراجعه", variant: "destructive" },
  CANCELLED: { label: "لغوشده", variant: "outline" },
};

/** Waiting-list status → Persian label + badge styling. */
const waitingStatusConfig: Record<
  WaitingListEntryStatus,
  { label: string; variant: "default" | "secondary" | "destructive" | "outline" }
> = {
  waiting: { label: "در انتظار", variant: "default" },
  notified: { label: "اطلاع‌رسانی‌شده", variant: "secondary" },
  booked: { label: "نوبت گرفته", variant: "outline" },
  expired: { label: "منقضی", variant: "destructive" },
};

/** Entry-type → Persian label for the quick-registration selector. */
const entryTypeLabels: Record<WaitingEntryType, string> = {
  ONLINE: "آنلاین",
  WALKIN: "حضوری",
  PHONE: "تلفنی",
};

/** One summary stat card. */
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            tone,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="space-y-0.5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold leading-none">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

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

/** Small inline spinner used inside pending action buttons. */
function PendingButton({
  children,
  pending,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button disabled={pending} {...props}>
      {pending ? (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <Loader2 className="size-4 animate-spin" />
        </span>
      ) : (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {children}
        </span>
      )}
    </Button>
  );
}

export default function ReceptionQueuePage() {
  const user = useAuthStore((s) => s.user);
  const { openDrawer, closeDrawer } = usePanelDrawer();

  // Filters---------------------------------------------------------------
  const [date, setDate] = useState<string>(todayISO());

  // Schedule / queue ------------------------------------------------------
  const {
    data: schedule,
    isLoading: scheduleLoading,
    isError: scheduleError,
    error: scheduleErr,
    refetch: refetchSchedule,
    isFetching: scheduleFetching,
  } = useDoctorSchedule(date);

  // Live auto-refresh every 15s while the page is mounted.
  useEffect(() => {
    const id = setInterval(() => {
      void refetchSchedule();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetchSchedule]);

  const doctorId = schedule?.doctor_id ?? user?.id ?? "";
  const doctorLabel = schedule?.doctor_id ? "پزشک شیفت" : "پزشک اختصاصی شما";

  const {
    data: waitingList,
    isLoading: waitingLoading,
    isError: waitingError,
  } = useWaitingList(doctorId || undefined, date);

  // Mutations -------------------------------------------------------------
  const settlePayment = useSettlePayment();
  const cancelPayment = useCancelPayment();
  const checkIn = useCheckIn();
  const confirmAppt = useConfirmAppointment();
  const callPatient = useCallPatient();
  const convertWaiting = useConvertWaitingEntry();
  const markNoShow = useMarkNoShow();

  function openQuickRegister() {
    openDrawer({
      title: "ثبت سریع بیمار",
      description:
        "بیمار حضوری یا تلفنی به لیست انتظار پزشک این شیفت اضافه می‌شود.",
      content: (
        <QuickRegisterForm
          doctorId={doctorId}
          date={date}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }

  /** Counts derived from the current schedule. */
  const stats = useMemo(() => {
    const items = schedule?.items ?? [];
    const checkedIn = items.filter((it) => it.status === "CHECKED_IN").length;
    const called = items.filter(
      (it) => it.status === "CALLED" || it.status === "IN_ROOM",
    ).length;
    const waiting = items.filter((it) => it.status === "CONFIRMED").length;
    const pending = items.filter((it) => it.status === "PENDING").length;
    const completed = items.filter((it) => it.status === "COMPLETED").length;
    const inProgress = items.filter((it) => it.status === "IN_PROGRESS").length;
    return {
      total: items.length,
      checkedIn,
      called,
      waiting,
      pending,
      completed,
      inProgress,
    };
  }, [schedule]);

  /** Settle the remaining payment for an appointment. */
  function handleSettle(item: DoctorScheduleItem) {
    settlePayment.mutate(
      { appointment_id: item.appointment_id },
      {
        onSuccess: () => toast.success(`تسویهٔ «${item.patient_name}» انجام شد.`),
        onError: (err) =>
          toast.error((err as Error)?.message ?? "تسویه ناموفق بود."),
      },
    );
  }

  /** Cancel (refund/penalty) an appointment's payment. */
  function handleCancel(item: DoctorScheduleItem) {
    cancelPayment.mutate(
      { appointment_id: item.appointment_id, is_late_or_no_show: false },
      {
        onSuccess: () => toast.success(`نوبت «${item.patient_name}» کنسل شد.`),
        onError: (err) =>
          toast.error((err as Error)?.message ?? "کنسل ناموفق بود."),
      },
    );
  }

  /** Confirm a pending appointment (sends SMS). */
  function handleConfirm(item: DoctorScheduleItem) {
    confirmAppt.mutate(item.appointment_id, {
      onSuccess: () =>
        toast.success(`نوبت «${item.patient_name}» تأیید و پیامک ارسال شد.`),
      onError: (err) =>
        toast.error((err as Error)?.message ?? "تأیید نوبت ناموفق بود."),
    });
  }

  /** Check-in: patient arrived → حاضر در مطب. */
  function handleCheckIn(item: DoctorScheduleItem) {
    checkIn.mutate(item.appointment_id, {
      onSuccess: () =>
        toast.success(`حضور «${item.patient_name}» در مطب ثبت شد.`),
      onError: (err) =>
        toast.error((err as Error)?.message ?? "ثبت حضور ناموفق بود."),
    });
  }

  /** Call patient: حاضر در مطب → فراخوان‌شده. */
  function handleCall(item: DoctorScheduleItem) {
    callPatient.mutate(item.appointment_id, {
      onSuccess: () => toast.success(`«${item.patient_name}» فراخوان شد.`),
      onError: (err) =>
        toast.error((err as Error)?.message ?? "فراخوان ناموفق بود."),
    });
  }

  /** Mark an appointment as a no-show. */
  function handleNoShow(item: DoctorScheduleItem) {
    markNoShow.mutate(
      { id: item.appointment_id },
      {
        onSuccess: () => toast.success("به عنوان عدم مراجعه ثبت شد"),
        onError: (err) =>
          toast.error((err as Error)?.message ?? "ثبت عدم مراجعه ناموفق بود."),
      },
    );
  }

  /** Convert a waiting-list entry into a confirmed booking. */
  function handleConvertToBooking(entry: WaitingListEntry) {
    convertWaiting.mutate(entry.id, {
      onSuccess: () => toast.success(`برای «${entry.patient_name}» نوبت ثبت شد.`),
      onError: (err) =>
        toast.error((err as Error)?.message ?? "تبدیل ناموفق بود."),
    });
  }

  /**
   * Render the status-based action buttons for an appointment row. Shared by
   * the desktop table and the mobile card layouts.
   */
  function renderActions(item: DoctorScheduleItem) {
    return (
      <>
        {/* PENDING → confirm */}
        {item.status === "PENDING" && (
          <PendingButton
            size="sm"
            pending={confirmAppt.isPending}
            onClick={() => handleConfirm(item)}
          >
            <CheckCircle2 className="size-4" />
            تأیید نوبت
          </PendingButton>
        )}

        {/* CONFIRMED → arrived (حاضر در مطب) */}
        {(item.status === "CONFIRMED" || item.status === "WAITING") && (
          <>
            <PendingButton
              size="sm"
              pending={checkIn.isPending}
              onClick={() => handleCheckIn(item)}
            >
              <UserCheck className="size-4" />
              حاضر در مطب
            </PendingButton>
            <PendingButton
              size="sm"
              variant="destructive"
              pending={markNoShow.isPending}
              onClick={() => handleNoShow(item)}
            >
              <UserX className="size-4" />
              عدم مراجعه
            </PendingButton>
          </>
        )}

        {/* CHECKED_IN → call / فراخوان */}
        {item.status === "CHECKED_IN" && (
          <>
            <PendingButton
              size="sm"
              pending={callPatient.isPending}
              onClick={() => handleCall(item)}
            >
              <DoorOpen className="size-4" />
              فراخوان
            </PendingButton>
            <PendingButton
              size="sm"
              variant="outline"
              pending={settlePayment.isPending}
              onClick={() => handleSettle(item)}
            >
              <CheckCircle2 className="size-4" />
              تسویه
            </PendingButton>
            <PendingButton
              size="sm"
              variant="destructive"
              pending={markNoShow.isPending}
              onClick={() => handleNoShow(item)}
            >
              <UserX className="size-4" />
              عدم مراجعه
            </PendingButton>
          </>
        )}

        {/* CALLED → settle / no-show (start visit is doctor-only) */}
        {(item.status === "CALLED" || item.status === "IN_ROOM") && (
          <>
            <PendingButton
              size="sm"
              variant="outline"
              pending={settlePayment.isPending}
              onClick={() => handleSettle(item)}
            >
              <CheckCircle2 className="size-4" />
              تسویه
            </PendingButton>
            <PendingButton
              size="sm"
              variant="destructive"
              pending={markNoShow.isPending}
              onClick={() => handleNoShow(item)}
            >
              <UserX className="size-4" />
              عدم مراجعه
            </PendingButton>
          </>
        )}

        {/* IN_PROGRESS / COMPLETED → settle (COMPLETED covers visits finished
            without a prior finance settle) */}
        {(item.status === "IN_PROGRESS" || item.status === "COMPLETED") && (
          <PendingButton
            size="sm"
            variant="outline"
            pending={settlePayment.isPending}
            onClick={() => handleSettle(item)}
          >
            <CheckCircle2 className="size-4" />
            تسویه
          </PendingButton>
        )}

        {/* Cancel is available for any non-terminal appointment. */}
        {item.status !== "CANCELLED" &&
          item.status !== "NO_SHOW" &&
          item.status !== "COMPLETED" && (
            <PendingButton
              size="sm"
              variant="ghost"
              pending={cancelPayment.isPending}
              onClick={() => handleCancel(item)}
            >
              <XCircle className="size-4" />
              کنسل
            </PendingButton>
          )}
      </>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ClipboardList className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">اتاق انتظار / صف پذیرش</h1>
            <LiveBadge />
          </div>
          <p className="text-sm text-muted-foreground">
            {formatJalaliLabel(date, "full")} · {doctorLabel}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="reception-date" className="text-xs text-muted-foreground">
            </Label>
            <JalaliDatePicker
              id="reception-date"
              value={date}
              onChange={(iso) => setDate(iso || todayISO())}
              className="w-44"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => refetchSchedule()}
            disabled={scheduleFetching}
            aria-label="بازخوانی"
          >
            <RefreshCw
              className={cn("size-4", scheduleFetching && "animate-spin")}
            />
            بازخوانی
          </Button>

          <Button onClick={openQuickRegister}>
            <Zap className="size-4" />
            ثبت سریع
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard
          icon={CalendarClock}
          label="کل بیماران امروز"
          value={stats.total}
          tone="bg-primary/10 text-primary"
        />
        <StatCard
          icon={Hourglass}
          label="در انتظار تأیید"
          value={stats.pending}
          tone="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300"
        />
        <StatCard
          icon={UserCheck}
          label="تأییدشده"
          value={stats.waiting}
          tone="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        />
        <StatCard
          icon={Users}
          label="حاضر در مطب"
          value={stats.checkedIn}
          tone="bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
        />
        <StatCard
          icon={DoorOpen}
          label="فراخوان‌شده"
          value={stats.called}
          tone="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
        />
        <StatCard
          icon={Stethoscope}
          label="در حال ویزیت"
          value={stats.inProgress}
          tone="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
        />
        <StatCard
          icon={CheckCircle2}
          label="تکمیل‌شده"
          value={stats.completed}
          tone="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
        />
      </div>

      {/* Section 1: Today's queue */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Users className="size-5 text-primary" />
          نوبت‌های امروز
        </h2>

        {scheduleLoading ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : scheduleError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="size-8 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium">بارگذاری صف امروز ممکن نشد.</p>
                <p className="text-sm text-muted-foreground">
                  {(scheduleErr as Error)?.message ?? "لطفاً دوباره تلاش کنید."}
                </p>
              </div>
              <Button variant="outline" onClick={() => refetchSchedule()}>
                تلاش مجدد
              </Button>
            </CardContent>
          </Card>
        ) : stats.total === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <CalendarClock className="size-8 text-muted-foreground" />
              <p className="font-medium">هیچ نوبتی برای این تاریخ وجود ندارد.</p>
              <p className="text-sm text-muted-foreground">
                صف امروز خالی است.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Desktop table */}
            <Card className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">ساعت</TableHead>
                    <TableHead>بیمار</TableHead>
                    <TableHead className="w-32">وضعیت</TableHead>
                    <TableHead className="w-32">زمان ویزیت</TableHead>
                    <TableHead className="w-[26rem] text-end">عملیات</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {schedule?.items.map((item) => {
                    const cfg = statusConfig[item.status] ?? {
                      label: item.status,
                      variant: "outline" as const,
                    };
                    return (
                      <TableRow key={item.appointment_id}>
                        <TableCell>
                          <div className="flex items-center gap-1.5 font-medium">
                            <Clock className="size-3.5 text-muted-foreground" />
                            <span>{item.start_time}</span>
                            <span className="text-xs text-muted-foreground">
                              – {item.end_time}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">
                              {item.patient_name}
                            </span>
                            {item.reason ? (
                              <span className="text-xs text-muted-foreground">
                                {item.reason}
                              </span>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="space-y-1">
                          <div className="flex items-center gap-1">
                            <Badge variant={cfg.variant} className={cfg.className}>
                              {cfg.label}
                            </Badge>
                            {(item.status === "CONFIRMED" ||
                              item.status === "CHECKED_IN" ||
                              item.status === "WAITING") &&
                            typeof item.queue_position === "number" ? (
                              <Badge variant="outline" className="mr-1">
                                #{item.queue_position}
                              </Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell>
                          {item.status === "IN_PROGRESS" &&
                          item.visit_started_at ? (
                            <VisitTimer startedAt={item.visit_started_at} />
                          ) : (
                            <span className="text-xs text-muted-foreground">
                              —
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="flex flex-wrap justify-end gap-1.5 text-end">
                          {renderActions(item)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>

            {/* Mobile cards */}
            <div className="space-y-3 md:hidden">
              {schedule?.items.map((item) => {
                const cfg = statusConfig[item.status] ?? {
                  label: item.status,
                  variant: "outline" as const,
                };
                return (
                  <Card key={item.appointment_id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <span className="font-medium">
                            {item.patient_name}
                          </span>
                          {item.reason ? (
                            <p className="text-xs text-muted-foreground">
                              {item.reason}
                            </p>
                          ) : null}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge variant={cfg.variant} className={cfg.className}>
                            {cfg.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                        <Clock className="size-3.5" />
                        <span>
                          {item.start_time} – {item.end_time}
                        </span>
                      </div>
                      {item.status === "IN_PROGRESS" &&
                      item.visit_started_at ? (
                        <div className="flex items-center justify-between gap-2 border-t pt-2">
                          <span className="text-xs font-medium text-muted-foreground">
                            زمان ویزیت
                          </span>
                          <VisitTimer startedAt={item.visit_started_at} />
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2">
                        {renderActions(item)}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Section 2: Waiting list */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Hourglass className="size-5 text-primary" />
          لیست انتظار
        </h2>

        {waitingLoading ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : waitingError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="size-8 text-destructive" />
              <p className="font-medium">بارگذاری لیست انتظار ممکن نشد.</p>
              <Button variant="outline" onClick={() => refetchSchedule()}>
                تلاش مجدد
              </Button>
            </CardContent>
          </Card>
        ) : !waitingList || waitingList.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
              <Hourglass className="size-8 text-muted-foreground" />
              <p className="font-medium">لیست انتظار خالی است.</p>
              <p className="text-sm text-muted-foreground">
                بیمار بدون نوبت را از دکمهٔ بالا اضافه کنید.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {waitingList.map((entry, idx) => {
                const cfg =
                  waitingStatusConfig[entry.status] ?? {
                    label: entry.status,
                    variant: "outline" as const,
                  };
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-muted text-sm font-bold">
                        {entry.position ?? idx + 1}
                      </span>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            {entry.patient_name}
                          </span>
                          <Badge variant={cfg.variant}>{cfg.label}</Badge>
                          {entry.entry_type ? (
                            <Badge variant="outline">
                              {entryTypeLabels[entry.entry_type]}
                            </Badge>
                          ) : null}
                        </div>
                        {entry.phone ? (
                          <p className="text-xs text-muted-foreground">
                            {entry.phone}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={convertWaiting.isPending}
                      onClick={() => handleConvertToBooking(entry)}
                    >
                      {convertWaiting.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : null}
                      تبدیل به نوبت
                    </Button>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
