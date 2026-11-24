"use client";

/**
 * Doctor — Schedule & visit settings.
 *
 * Route: `/doctor/shifts`.
 *
 * Combined page for visit pricing/duration plus the doctor's own shifts and
 * time blocks. Visit settings live in VisitSettingsSection; shift CRUD and
 * time-block management stay below.
 */

import { useMemo } from "react";
import {
  AlertCircle,
  CalendarDays,
  Clock,
  Loader2,
  Plus,
  Power,
  Trash2,
} from "lucide-react";

import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useDeleteShift,
  useDeleteTimeBlock,
  useDoctorShifts,
  useTimeBlocks,
  useUpdateShift,
} from "@/hooks/useDoctorShifts";
import { useAuthStore } from "@/store/authStore";
import { formatJalaliLabel } from "@/lib/jalali";
import { ShiftForm } from "./_components/ShiftFormDialog";
import { TimeBlockForm } from "./_components/TimeBlockDialog";
import { VisitSettingsSection } from "./_components/VisitSettingsSection";

export default function DoctorShiftsPage() {
  const doctorId = useAuthStore((s) => s.user?.id) ?? "";
  const { openDrawer, closeDrawer } = usePanelDrawer();

  const { data: shifts, isLoading, isError, error } = useDoctorShifts(doctorId);
  const { data: timeBlocks } = useTimeBlocks(doctorId);
  const deleteMutation = useDeleteShift();
  const updateMutation = useUpdateShift();
  const deleteTimeBlockMutation = useDeleteTimeBlock();

  function openCreateShift() {
    openDrawer({
      title: "افزودن شیفت",
      description:
        "یک شیفت جدید برای خود ثبت کنید. در صورت فعال‌سازی حالت تکرارشونده، شیفت برای روزهای انتخابی در بازهٔ مشخص ساخته می‌شود.",
      content: (
        <ShiftForm
          doctorId={doctorId}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }

  function openCreateTimeBlock() {
    openDrawer({
      title: "بلوک زمانی",
      description:
        "یک بازه زمانی را مسدود کنید تا در آن زمان نوبت‌پذیری انجام نشود.",
      content: (
        <TimeBlockForm
          doctorId={doctorId}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }

  /** Sort shifts earliest-first (ascending): from today into the future. */
  const sortedShifts = useMemo(() => {
    return [...(shifts ?? [])].sort((a, b) => {
      const da = `${a.date} ${a.start_time}`;
      const db = `${b.date} ${b.start_time}`;
      return da.localeCompare(db);
    });
  }, [shifts]);

  /** Sort time blocks earliest-first for display. */
  const sortedTimeBlocks = useMemo(() => {
    return [...(timeBlocks ?? [])].sort((a, b) => {
      const da = `${a.date} ${a.start_time}`;
      const db = `${b.date} ${b.start_time}`;
      return da.localeCompare(db);
    });
  }, [timeBlocks]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-2">
        <CalendarDays className="size-6 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            برنامه و تنظیمات
          </h1>
          <p className="text-sm text-muted-foreground">
            هزینهٔ ویزیت، شیفت‌های کاری و بلوک‌های زمانی خود را مدیریت کنید.
          </p>
        </div>
      </div>

      <VisitSettingsSection />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Shifts panel */}
        <Card className="flex h-[28rem] flex-col overflow-hidden">
          <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarDays className="size-4 text-primary" />
              شیفت‌ها
            </CardTitle>
            <Button size="sm" onClick={openCreateShift}>
              <Plus className="size-4" />
              افزودن شیفت
            </Button>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {isError && (
              <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                بارگذاری شیفت‌ها ناموفق بود:{" "}
                {error instanceof Error ? error.message : "خطای ناشناخته"}
              </div>
            )}

            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex h-full flex-col items-center justify-center gap-3 py-8 text-center">
                <AlertCircle className="size-8 text-destructive" />
                <p className="text-sm text-muted-foreground">
                  بارگذاری شیفت‌ها ممکن نشد.
                </p>
              </div>
            ) : sortedShifts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center">
                <CalendarDays className="size-8 text-muted-foreground" />
                <p className="font-medium">هنوز شیفتی ثبت نشده است.</p>
                <p className="text-sm text-muted-foreground">
                  با دکمهٔ «افزودن شیفت» اولین شیفت خود را بسازید.
                </p>
                <Button className="mt-2" onClick={openCreateShift}>
                  <Plus className="size-4" />
                  افزودن شیفت
                </Button>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-card [&_tr]:border-b">
                    <TableRow>
                      <TableHead>تاریخ</TableHead>
                      <TableHead>بازهٔ زمانی</TableHead>
                      <TableHead>حداکثر بیمار</TableHead>
                      <TableHead>وضعیت</TableHead>
                      <TableHead className="text-end">عملیات</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedShifts.map((shift) => {
                      const isActive = shift.is_active !== false;
                      const togglingThis =
                        updateMutation.isPending &&
                        updateMutation.variables?.shiftId === shift.id;
                      return (
                        <TableRow key={shift.id}>
                          <TableCell className="font-medium tabular-nums">
                            {shift.date
                              ? formatJalaliLabel(shift.date, "full")
                              : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {shift.start_time} – {shift.end_time}
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {shift.max_patients}
                          </TableCell>
                          <TableCell>
                            {isActive ? (
                              <Badge variant="secondary">فعال</Badge>
                            ) : (
                              <Badge variant="outline">غیرفعال</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-end">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                type="button"
                                variant={isActive ? "default" : "outline"}
                                size="sm"
                                className="size-8 p-0"
                                aria-label={
                                  isActive
                                    ? "غیرفعال کردن شیفت"
                                    : "فعال کردن شیفت"
                                }
                                title={
                                  isActive
                                    ? "غیرفعال کردن شیفت"
                                    : "فعال کردن شیفت"
                                }
                                disabled={updateMutation.isPending}
                                onClick={() =>
                                  updateMutation.mutate({
                                    shiftId: shift.id,
                                    data: { is_active: !isActive },
                                  })
                                }
                              >
                                {togglingThis ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Power className="size-4" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="size-8 p-0 text-destructive hover:text-destructive"
                                aria-label="حذف شیفت"
                                disabled={deleteMutation.isPending}
                                onClick={() =>
                                  deleteMutation.mutate(shift.id)
                                }
                              >
                                {deleteMutation.isPending &&
                                deleteMutation.variables === shift.id ? (
                                  <Loader2 className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Time blocks panel */}
        <Card className="flex h-[28rem] flex-col overflow-hidden">
          <CardHeader className="flex shrink-0 flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" />
              بلوک‌های زمانی
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              onClick={openCreateTimeBlock}
            >
              <Plus className="size-4" />
              افزودن بلوک
            </Button>
          </CardHeader>
          <CardContent className="min-h-0 flex-1 overflow-y-auto">
            {sortedTimeBlocks.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-1 py-8 text-center">
                <Clock className="size-7 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  هیچ بلوک زمانی ثبت نشده است.
                </p>
              </div>
            ) : (
              <ul className="divide-y rounded-md border">
                {sortedTimeBlocks.map((block) => {
                  const deletingThis =
                    deleteTimeBlockMutation.isPending &&
                    deleteTimeBlockMutation.variables === block.id;
                  return (
                    <li
                      key={block.id}
                      className="flex items-center justify-between gap-3 p-3"
                    >
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-medium tabular-nums">
                          {block.date
                            ? formatJalaliLabel(block.date, "full")
                            : "—"}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          <span className="tabular-nums">
                            {block.start_time} – {block.end_time}
                          </span>
                          {block.reason ? (
                            <span className="ms-2">• {block.reason}</span>
                          ) : null}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 shrink-0 p-0 text-destructive hover:text-destructive"
                        aria-label="حذف بلوک زمانی"
                        title="حذف بلوک زمانی"
                        disabled={deleteTimeBlockMutation.isPending}
                        onClick={() => {
                          if (window.confirm("این بلوک زمانی حذف شود؟")) {
                            deleteTimeBlockMutation.mutate(block.id);
                          }
                        }}
                      >
                        {deletingThis ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
