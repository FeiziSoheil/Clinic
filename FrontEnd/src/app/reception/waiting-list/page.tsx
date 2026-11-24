"use client";

/**
 * Reception — Waiting List Center ("مرکز لیست انتظار").
 *
 * Route: `/reception/waiting-list`.
 *
 * A focused workspace for managing the doctor's waiting list for a given date.
 * Renders two sections:
 *
 *   1. **Stats** — total, URGENT (red), NORMAL, and notified/booked counts.
 *   2. **Entries** — every waiting-list entry with per-row actions: toggle
 *      priority, offer a specific slot, or convert into an appointment.
 *
 * The doctor id is derived from the doctor schedule response (same pattern as
 * the reception queue page) and the list can be filtered by priority. All copy
 * is Persian and the layout is RTL.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarClock,
  Clock,
  Hourglass,
  ListChecks,
  Loader2,
  RefreshCw,
  Users,
  Zap,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatJalaliLabel, formatJalaliDateTime } from "@/lib/jalali";
import { useAuthStore } from "@/store/authStore";
import { useDoctorSchedule } from "@/hooks/useDoctorPortal";
import {
  useConvertWaitingEntry,
  useUpdateWaitingPriority,
  useWaitingList,
} from "@/hooks/useBooking";
import type {
  WaitingEntryType,
  WaitingListEntry,
  WaitingListEntryStatus,
  WaitingPriority,
} from "@/types/booking";
import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import { OfferSlotForm } from "./_components/OfferSlotDialog";

/** Today's date as `"YYYY-MM-DD"`. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

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

/** Entry-type → Persian label. */
const entryTypeLabels: Record<WaitingEntryType, string> = {
  ONLINE: "آنلاین",
  WALKIN: "حضوری",
  PHONE: "تلفنی",
};

/** Priority filter values. */
type PriorityFilter = "ALL" | WaitingPriority;

/** Priority badge styling. */
const priorityBadgeClass: Record<WaitingPriority, string> = {
  URGENT:
    "border-transparent bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  NORMAL:
    "border-transparent bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
};

const priorityLabel: Record<WaitingPriority, string> = {
  URGENT: "فوری",
  NORMAL: "عادی",
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

/** Small inline spinner used inside pending action buttons. */
function PendingButton({
  children,
  pending,
  ...props
}: React.ComponentProps<typeof Button> & { pending?: boolean }) {
  return (
    <Button disabled={pending} {...props}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <span>{children}</span>}
    </Button>
  );
}

export default function WaitingListHubPage() {
  const user = useAuthStore((s) => s.user);
  const { openDrawer, closeDrawer } = usePanelDrawer();

  const [date, setDate] = useState<string>(todayISO());
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("ALL");

  function openOfferSlot(entry: WaitingListEntry) {
    const name = entry.patient_name ?? "بدون نام";
    openDrawer({
      title: "ارائه نوبت",
      description: `یک نوبت جدید برای «${name}» ثبت کنید.`,
      content: (
        <OfferSlotForm
          entryId={entry.id}
          patientName={name}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }

  // Derive the doctor id from the doctor schedule response (same pattern as
  // the reception queue page), falling back to the signed-in user's id.
  const scheduleQuery = useDoctorSchedule(date);
  const doctorId = scheduleQuery.data?.doctor_id ?? user?.id ?? "";

  const {
    data: waitingList,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useWaitingList(doctorId || undefined, date);

  const updatePriority = useUpdateWaitingPriority();
  const convertWaiting = useConvertWaitingEntry();

  /** Counts derived from the current waiting list. */
  const stats = useMemo(() => {
    const items = waitingList ?? [];
    return {
      total: items.length,
      urgent: items.filter((e) => e.priority === "URGENT").length,
      normal: items.filter((e) => e.priority === "NORMAL").length,
      notified: items.filter(
        (e) => e.status === "notified" || e.status === "booked",
      ).length,
    };
  }, [waitingList]);

  /**
   * Filter by priority then sort: URGENT first, then by creation time
   * (ascending — earliest first), matching the backend's sorted response.
   */
  const sortedEntries = useMemo(() => {
    let items = waitingList ?? [];
    if (priorityFilter !== "ALL") {
      items = items.filter((e) => e.priority === priorityFilter);
    }
    return [...items].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority === "URGENT" ? -1 : 1;
      }
      return (
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
    });
  }, [waitingList, priorityFilter]);

  /** Toggle a single entry's priority between NORMAL ↔ URGENT. */
  function handleTogglePriority(entry: WaitingListEntry) {
    const next: WaitingPriority =
      entry.priority === "URGENT" ? "NORMAL" : "URGENT";
    updatePriority.mutate(
      { id: entry.id, priority: next },
      {
        onSuccess: () =>
          toast.success(
            `اولویت «${entry.patient_name ?? "بدون نام"}» به «${priorityLabel[next]}» تغییر کرد.`,
          ),
        onError: (err) =>
          toast.error((err as Error)?.message ?? "تغییر اولویت ناموفق بود."),
      },
    );
  }

  /** Convert a waiting-list entry into a confirmed booking. */
  function handleConvertToBooking(entry: WaitingListEntry) {
    convertWaiting.mutate(entry.id, {
      onSuccess: () =>
        toast.success(`برای «${entry.patient_name ?? "بدون نام"}» نوبت ثبت شد.`),
      onError: (err) =>
        toast.error((err as Error)?.message ?? "تبدیل ناموفق بود."),
    });
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header + filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Hourglass className="size-6 text-primary" />
            <h1 className="text-2xl font-bold">مرکز لیست انتظار</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            {formatJalaliLabel(date, "full")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="waiting-list-date" className="text-xs text-muted-foreground">
              تاریخ
            </Label>
            <JalaliDatePicker
              id="waiting-list-date"
              value={date}
              onChange={(iso) => setDate(iso || todayISO())}
              className="w-44"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="بازخوانی"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} />
            بازخوانی
          </Button>
        </div>
      </div>

      {/* Section A: Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          icon={ListChecks}
          label="کل در انتظار"
          value={stats.total}
          tone="bg-primary/10 text-primary"
        />
        <StatCard
          icon={Zap}
          label="فوری"
          value={stats.urgent}
          tone="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
        />
        <StatCard
          icon={Users}
          label="عادی"
          value={stats.normal}
          tone="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
        />
        <StatCard
          icon={CalendarClock}
          label="اطلاع‌رسانی/نوبت‌دار"
          value={stats.notified}
          tone="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
        />
      </div>

      {/* Section B: filter + entries */}
      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Users className="size-5 text-primary" />
            افراد لیست انتظار
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="priority-filter" className="text-xs text-muted-foreground">
              فیلتر اولویت
            </Label>
            <Select
              value={priorityFilter}
              onValueChange={(v) => setPriorityFilter(v as PriorityFilter)}
            >
              <SelectTrigger id="priority-filter" className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">همه</SelectItem>
                <SelectItem value="URGENT">فوری</SelectItem>
                <SelectItem value="NORMAL">عادی</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <AlertCircle className="size-8 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium">بارگذاری لیست انتظار ممکن نشد.</p>
                <p className="text-sm text-muted-foreground">
                  {(error as Error)?.message ?? "لطفاً دوباره تلاش کنید."}
                </p>
              </div>
              <Button variant="outline" onClick={() => refetch()}>
                تلاش مجدد
              </Button>
            </CardContent>
          </Card>
        ) : sortedEntries.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
              <Hourglass className="size-8 text-muted-foreground" />
              <p className="font-medium">لیست انتظار خالی است.</p>
              <p className="text-sm text-muted-foreground">
                برای این تاریخ بیماری در لیست انتظار وجود ندارد.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="divide-y p-0">
              {sortedEntries.map((entry, idx) => {
                const statusCfg =
                  waitingStatusConfig[entry.status] ?? {
                    label: entry.status,
                    variant: "outline" as const,
                  };
                const isTerminal =
                  entry.status === "booked" || entry.status === "expired";
                return (
                  <div
                    key={entry.id}
                    className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                        {entry.position ?? idx + 1}
                      </span>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {entry.patient_name || "بدون نام"}
                          </span>
                          <Badge className={priorityBadgeClass[entry.priority]}>
                            {priorityLabel[entry.priority]}
                          </Badge>
                          {entry.entry_type ? (
                            <Badge variant="outline">
                              {entryTypeLabels[entry.entry_type]}
                            </Badge>
                          ) : null}
                          <Badge variant={statusCfg.variant}>
                            {statusCfg.label}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                          <span>{entry.phone || "—"}</span>
                          {entry.created_at ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="size-3" />
                              {formatJalaliDateTime(entry.created_at)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {/* Toggle priority */}
                      <PendingButton
                        size="sm"
                        variant="outline"
                        pending={updatePriority.isPending}
                        onClick={() => handleTogglePriority(entry)}
                        disabled={isTerminal}
                      >
                        {entry.priority === "URGENT" ? "عادی کردن" : "فوری کردن"}
                      </PendingButton>

                      {/* Offer slot */}
                      <PendingButton
                        size="sm"
                        onClick={() => openOfferSlot(entry)}
                        disabled={isTerminal}
                      >
                        <CalendarClock className="size-4" />
                        ارائه نوبت
                      </PendingButton>

                      {/* Convert to appointment */}
                      <PendingButton
                        size="sm"
                        variant="secondary"
                        pending={convertWaiting.isPending}
                        onClick={() => handleConvertToBooking(entry)}
                        disabled={isTerminal}
                      >
                        تبدیل به نوبت
                      </PendingButton>
                    </div>
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
