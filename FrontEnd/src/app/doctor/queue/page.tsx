"use client";

/**
 * Doctor — Live Patient Queue (unified).
 *
 * Route: `/doctor/queue`.
 *
 * A single unified "live patient queue" view that merges the former
 * [`/doctor/schedule`](src/app/doctor/schedule/page.tsx),
 * [`/doctor/queue`](src/app/doctor/queue/page.tsx), and
 * [`/doctor/patients/checklist`](src/app/doctor/patients/checklist/page.tsx)
 * pages into one screen.
 *
 * Features:
 * - Live header with date picker, a pulsing LIVE badge, and 15s auto-refresh.
 * - View toggle between **"جدول"** (table) and **"چک‌لیست"** (checklist).
 * - Summary stat cards (total / waiting / in-progress / completed / no-show).
 * - Name search/filter.
 * - Status-based ordering (WAITING/CHECKED_IN first by queue_position then
 *   start_time, then COMPLETED, then NO_SHOW/CANCELLED last).
 * - Per-row actions wired to {@link useStartVisit} / {@link useCompleteVisit}
 *   and a link into the EHR page for the appointment.
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCheck,
  ClipboardList,
  Clock,
  FileText,
  ListOrdered,
  Loader2,
  PlayCircle,
  Search,
  Stethoscope,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { formatJalaliLabel } from "@/lib/jalali";
import {
  PanelPageHeader,
  PanelStatCard,
} from "@/components/shared/panel/PanelKit";
import { useDoctorSchedule } from "@/hooks/useDoctorPortal";
import { useStartVisit, useCompleteVisit } from "@/hooks/useBooking";
import { VisitTimer } from "@/app/reception/queue/_components/VisitTimer";
import type { DoctorScheduleItem } from "@/types/doctor-portal";

/** Auto-refresh interval (ms) for the live queue. */
const REFRESH_INTERVAL_MS = 15_000;

/** Today's date as `"YYYY-MM-DD"` (UTC, matches the backend's expectation). */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Status → styling config used by every badge in the queue. */
const statusConfig: Record<
  DoctorScheduleItem["status"],
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    className?: string;
  }
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

/**
 * Relative weight so called/checked-in patients sort near the top for the doctor.
 */
const statusOrder: Record<DoctorScheduleItem["status"], number> = {
  CALLED: 0,
  IN_ROOM: 0,
  CHECKED_IN: 1,
  IN_PROGRESS: 1,
  CONFIRMED: 2,
  WAITING: 2,
  PENDING: 3,
  COMPLETED: 4,
  NO_SHOW: 5,
  CANCELLED: 6,
};

/** Statuses from which a visit can be started (after reception فراخوان). */
const STARTABLE: DoctorScheduleItem["status"][] = ["CALLED", "IN_ROOM"];

/** Statuses from which a visit can be completed. */
const COMPLETABLE: DoctorScheduleItem["status"][] = ["IN_PROGRESS"];

/** Which visual progress marker a checklist row gets. */
function progressMark(status: DoctorScheduleItem["status"]): {
  glyph: string;
  className: string;
  title: string;
} {
  if (status === "COMPLETED") {
    return { glyph: "✅", className: "text-green-600", title: "تکمیل‌شده" };
  }
  if (status === "IN_PROGRESS") {
    return { glyph: "🔵", className: "text-blue-600", title: "در حال انجام" };
  }
  if (status === "CALLED" || status === "IN_ROOM") {
    return { glyph: "🟣", className: "text-violet-600", title: "فراخوان‌شده" };
  }
  return { glyph: "⬜", className: "text-muted-foreground", title: "در انتظار" };
}

export default function DoctorQueuePage() {
  const router = useRouter();
  const [date, setDate] = useState<string>(todayISO());
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "checklist">("table");

  const scheduleQuery = useDoctorSchedule(date);
  const { refetch: refetchSchedule } = scheduleQuery;
  const startVisit = useStartVisit();
  const completeVisit = useCompleteVisit();

  // Live auto-refresh every 15s.
  useEffect(() => {
    const id = setInterval(() => {
      void refetchSchedule();
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetchSchedule]);

  const data = scheduleQuery.data;
  const items = useMemo(() => data?.items ?? [], [data]);

  const stats = useMemo(() => {
    const total = items.length;
    const waiting = items.filter(
      (i) =>
        i.status === "CALLED" ||
        i.status === "IN_ROOM" ||
        i.status === "CHECKED_IN",
    ).length;
    const inProgress = items.filter((i) => i.status === "IN_PROGRESS").length;
    const completed = items.filter((i) => i.status === "COMPLETED").length;
    const noShow = items.filter(
      (i) => i.status === "NO_SHOW" || i.status === "CANCELLED",
    ).length;
    return { total, waiting, inProgress, completed, noShow };
  }, [items]);

  /**
   * Sort the queue: CALLED first, then CHECKED_IN, then IN_PROGRESS, etc.
   */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? items.filter((i) => i.patient_name.toLowerCase().includes(q) || i.patient_id.toLowerCase().includes(q))
      : items;
    return [...list].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9);
      if (so !== 0) return so;
      if (
        (a.status === "CALLED" || a.status === "CHECKED_IN") &&
        (b.status === "CALLED" || b.status === "CHECKED_IN")
      ) {
        const ap = a.queue_position ?? Number.MAX_SAFE_INTEGER;
        const bp = b.queue_position ?? Number.MAX_SAFE_INTEGER;
        if (ap !== bp) return ap - bp;
      }
      return a.start_time.localeCompare(b.start_time);
    });
  }, [items, query]);

  function handleStartVisit(item: DoctorScheduleItem) {
    startVisit.mutate(
      { id: item.appointment_id },
      {
        onSuccess: () => toast.success("ویزیت شروع شد"),
        onError: (err: unknown) =>
          toast.error("شروع ویزیت ناموفق بود", {
            description: (err as Error)?.message,
          }),
      },
    );
  }

  function handleCompleteVisit(item: DoctorScheduleItem) {
    completeVisit.mutate(
      { id: item.appointment_id },
      {
        onSuccess: () => toast.success("ویزیت تکمیل شد"),
        onError: (err: unknown) =>
          toast.error("تکمیل ویزیت ناموفق بود", {
            description: (err as Error)?.message,
          }),
      },
    );
  }

  function openEhr(item: DoctorScheduleItem) {
    router.push(
      `/doctor/patients/${item.patient_id}/ehr?appointment=${item.appointment_id}`,
    );
  }

  const isBusy = startVisit.isPending || completeVisit.isPending;
  const isLoading = scheduleQuery.isLoading;
  const isError = scheduleQuery.isError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PanelPageHeader
        title="صف زنده بیماران"
        subtitle={formatJalaliLabel(date, "full")}
        icon={ListOrdered}
        tone="brand"
        actions={
          <>
            {/* LIVE badge */}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              <span className="size-2 animate-pulse rounded-full bg-emerald-500" />
              زنده
            </span>
            <div className="w-[180px]">
              <JalaliDatePicker
                value={date}
                onChange={(iso) => setDate(iso || todayISO())}
              />
            </div>
          </>
        }
      />

      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <PanelStatCard icon={ClipboardList} label="کل" value={stats.total} tone="brand" />
        <PanelStatCard icon={Users} label="در انتظار" value={stats.waiting} tone="info" />
        <PanelStatCard icon={PlayCircle} label="در حال ویزیت" value={stats.inProgress} tone="gold" />
        <PanelStatCard icon={UserCheck} label="تکمیل‌شده" value={stats.completed} tone="success" />
        <PanelStatCard icon={UserX} label="غیبت" value={stats.noShow} tone="danger" />
      </div>

      {/* Search + view toggle */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجو بر اساس نام یا شناسهٔ بیمار..."
            className="pr-9"
          />
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as "table" | "checklist")}>
          <TabsList>
            <TabsTrigger value="table">جدول</TabsTrigger>
            <TabsTrigger value="checklist">چک‌لیست</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* States */}
      {isLoading ? (
        view === "table" ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        )
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">بارگذاری صف ممکن نشد.</p>
              <p className="text-sm text-muted-foreground">
                {(scheduleQuery.error as Error)?.message ?? "لطفاً دوباره تلاش کنید."}
              </p>
            </div>
            <Button variant="outline" onClick={() => scheduleQuery.refetch()}>
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="font-medium">بیماری برای امروز ثبت نشده است.</p>
          </CardContent>
        </Card>
      ) : view === "table" ? (
        <TableView
          items={filtered}
          isBusy={isBusy}
          onStart={handleStartVisit}
          onComplete={handleCompleteVisit}
          onOpenEhr={openEhr}
          startPendingId={startVisit.variables?.id}
          completePendingId={completeVisit.variables?.id}
        />
      ) : (
        <ChecklistView
          items={filtered}
          isBusy={isBusy}
          onStart={handleStartVisit}
          onComplete={handleCompleteVisit}
          onOpenEhr={openEhr}
          startPendingId={startVisit.variables?.id}
          completePendingId={completeVisit.variables?.id}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Table view                                                                */
/* -------------------------------------------------------------------------- */

type RowActions = {
  isBusy: boolean;
  onStart: (item: DoctorScheduleItem) => void;
  onComplete: (item: DoctorScheduleItem) => void;
  onOpenEhr: (item: DoctorScheduleItem) => void;
  startPendingId?: string;
  completePendingId?: string;
};

function ActionButtons({
  item,
  actions,
}: {
  item: DoctorScheduleItem;
  actions: RowActions;
}) {
  const { isBusy, onStart, onComplete, onOpenEhr, startPendingId, completePendingId } =
    actions;
  const canStart = STARTABLE.includes(item.status);
  const canComplete = COMPLETABLE.includes(item.status);
  const isCompleted = item.status === "COMPLETED";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {canStart ? (
        <Button size="sm" onClick={() => onStart(item)} disabled={isBusy}>
          {startPendingId === item.appointment_id ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PlayCircle className="size-4" />
          )}
          شروع ویزیت
        </Button>
      ) : null}
      {canComplete ? (
        <Button size="sm" onClick={() => onComplete(item)} disabled={isBusy}>
          {completePendingId === item.appointment_id ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <CheckCheck className="size-4" />
          )}
          تکمیل ویزیت
        </Button>
      ) : null}
      {(canStart || canComplete || isCompleted) ? (
        <Button size="sm" variant="outline" onClick={() => onOpenEhr(item)}>
          <FileText className="size-4" />
          {isCompleted ? "مشاهده پرونده" : "پرونده"}
        </Button>
      ) : null}
    </div>
  );
}

function TableView({
  items,
  ...actions
}: { items: DoctorScheduleItem[] } & RowActions) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-md border sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">ساعت</TableHead>
              <TableHead>نام بیمار</TableHead>
              <TableHead>وضعیت</TableHead>
              <TableHead className="w-32">زمان ویزیت</TableHead>
              <TableHead className="w-[90px]">موقعیت صف</TableHead>
              <TableHead className="text-end">اقدامات</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => {
              const cfg = statusConfig[item.status] ?? {
                label: item.status,
                variant: "outline" as const,
              };
              return (
                <TableRow key={item.appointment_id}>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {item.start_time} – {item.end_time}
                  </TableCell>
                  <TableCell className="font-medium">
                    {item.patient_name}
                    {item.reason ? (
                      <span className="block text-xs text-muted-foreground">
                        {item.reason}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="space-y-1">
                    <Badge variant={cfg.variant} className={cfg.className}>
                      {cfg.label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {item.status === "IN_PROGRESS" &&
                    item.visit_started_at ? (
                      <VisitTimer startedAt={item.visit_started_at} />
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {typeof item.queue_position === "number" &&
                    (item.status === "CALLED" ||
                      item.status === "IN_ROOM" ||
                      item.status === "CHECKED_IN") ? (
                      <span className="inline-flex size-7 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary">
                        {item.queue_position}
                      </span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-end">
                    <ActionButtons item={item} actions={actions} />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 sm:hidden">
        {items.map((item) => {
          const cfg = statusConfig[item.status] ?? {
            label: item.status,
            variant: "outline" as const,
          };
          return (
            <Card key={item.appointment_id}>
              <CardContent className="flex flex-col gap-3 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{item.patient_name}</span>
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="size-3" />
                    {item.start_time} – {item.end_time}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={cfg.variant} className={cfg.className}>
                    {cfg.label}
                  </Badge>
                  {item.status === "IN_PROGRESS" &&
                  item.visit_started_at ? (
                    <VisitTimer startedAt={item.visit_started_at} />
                  ) : null}
                  {typeof item.queue_position === "number" &&
                  (item.status === "CALLED" ||
                    item.status === "IN_ROOM" ||
                    item.status === "CHECKED_IN") ? (
                    <Badge variant="outline">صف #{item.queue_position}</Badge>
                  ) : null}
                  {item.has_ehr ? (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-300">
                      <FileText className="size-3" />
                      SOAP
                    </span>
                  ) : null}
                </div>
                {item.reason ? (
                  <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Stethoscope className="size-3" />
                    {item.reason}
                  </p>
                ) : null}
                <ActionButtons item={item} actions={actions} />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Checklist view                                                             */
/* -------------------------------------------------------------------------- */

function ChecklistView({
  items,
  ...actions
}: { items: DoctorScheduleItem[] } & RowActions) {
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const cfg = statusConfig[item.status] ?? statusConfig.PENDING;
        const mark = progressMark(item.status);
        return (
          <Card key={item.appointment_id}>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              {/* Left: progress + identity */}
              <div className="flex items-center gap-3">
                <span
                  className={cn("select-none text-xl", mark.className)}
                  title={mark.title}
                  aria-label={mark.title}
                >
                  {mark.glyph}
                </span>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.patient_name || "—"}</p>
                    <Badge variant={cfg.variant} className={cfg.className}>
                      {cfg.label}
                    </Badge>
                    {item.status === "IN_PROGRESS" &&
                    item.visit_started_at ? (
                      <VisitTimer startedAt={item.visit_started_at} />
                    ) : null}
                    {item.has_ehr ? (
                      <Badge variant="outline" className="gap-1">
                        <FileText className="size-3" />
                        SOAP
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3" />
                      {item.start_time} – {item.end_time}
                    </span>
                    {typeof item.queue_position === "number" &&
                    (item.status === "CALLED" ||
                      item.status === "IN_ROOM" ||
                      item.status === "CHECKED_IN") ? (
                      <span className="inline-flex items-center gap-1">
                        <ListOrdered className="size-3" />
                        صف #{item.queue_position}
                      </span>
                    ) : null}
                    {item.reason ? (
                      <span className="inline-flex items-center gap-1">
                        <Stethoscope className="size-3" />
                        {item.reason}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Right: actions */}
              <ActionButtons item={item} actions={actions} />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
