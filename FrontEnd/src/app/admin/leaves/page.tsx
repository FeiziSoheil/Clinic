"use client";

/**
 * Admin Leaves management page.
 *
 * Lists doctor leaves in a responsive shadcn table with a doctor filter
 * dropdown, a "Create Leave" dialog, a per-row delete action (with a confirm),
 * loading skeletons and an empty state. On small screens the table is replaced
 * by stacked cards.
 *
 * The backend does not denormalize the doctor name on leaves, so it is resolved
 * client-side from the admin doctors list.
 */

import { useMemo, useState } from "react";
import {
  CalendarOff,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";

import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminDoctors } from "@/hooks/useAdminDoctors";
import { useDeleteLeave, useLeaves } from "@/hooks/useLeaves";
import type { Leave, LeaveStatus } from "@/types/schedule";
import { AdminLeaveForm } from "./_components/LeaveFormDialog";

/** Sentinel value meaning "all doctors" in the filter select. */
const ALL_DOCTORS = "__all__";

export default function AdminLeavesPage() {
  const [doctorFilter, setDoctorFilter] = useState<string>(ALL_DOCTORS);
  const { openDrawer, closeDrawer } = usePanelDrawer();

  const { data: doctors = [] } = useAdminDoctors();
  const activeDoctorId =
    doctorFilter === ALL_DOCTORS ? undefined : doctorFilter;
  const { data: leaves, isLoading, isError, error } = useLeaves(activeDoctorId);
  const deleteMutation = useDeleteLeave();

  const [deleteTarget, setDeleteTarget] = useState<Leave | null>(null);

  function openCreateLeave() {
    openDrawer({
      title: "ثبت مرخصی",
      description: "یک مرخصی جدید برای پزشک ثبت کنید.",
      content: (
        <AdminLeaveForm
          doctors={doctors}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }

  /** Map doctor id → display name so the table can show names. */
  const doctorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctors) {
      map.set(d.id, `${d.first_name} ${d.last_name}`);
    }
    return map;
  }, [doctors]);

  const list = useMemo(() => {
    const raw = leaves ?? [];
    return raw.map((l) => ({
      ...l,
      doctor_name: l.doctor_name ?? doctorNameById.get(l.doctor_id),
    }));
  }, [leaves, doctorNameById]);

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">مدیریت مرخصی‌ها</h1>
          <p className="text-sm text-muted-foreground">
            ثبت و مدیریت مرخصی‌های پزشکان.
          </p>
        </div>
        <Button onClick={openCreateLeave} disabled={doctors.length === 0}>
          <Plus className="size-4" />
          ثبت مرخصی
        </Button>
      </div>

      {/* Doctor filter */}
      <div className="max-w-xs">
        <label htmlFor="doctor-filter" className="sr-only">
          فیلتر بر اساس پزشک
        </label>
        <Select value={doctorFilter} onValueChange={setDoctorFilter}>
          <SelectTrigger id="doctor-filter" className="w-full">
            <SelectValue placeholder="همه پزشکان" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_DOCTORS}>همه پزشکان</SelectItem>
            {doctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.first_name} {d.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Error banner */}
      {isError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          بارگذاری مرخصی‌ها ناموفق بود:{" "}
          {error instanceof Error ? error.message : "خطای ناشناخته"}
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <EmptyState onAdd={openCreateLeave} canAdd={doctors.length > 0} />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto rounded-md border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>پزشک</TableHead>
                  <TableHead>از تاریخ</TableHead>
                  <TableHead>تا تاریخ</TableHead>
                  <TableHead>دلیل</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell className="font-medium">
                      {leave.doctor_name ?? "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {leave.start_date}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {leave.end_date}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {leave.reason || "—"}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={leave.status} />
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="size-8 p-0 text-destructive hover:text-destructive"
                        aria-label="حذف مرخصی"
                        onClick={() => setDeleteTarget(leave)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {list.map((leave) => (
              <Card key={leave.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{leave.doctor_name ?? "—"}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {leave.start_date} ← {leave.end_date}
                      </p>
                      {leave.reason && (
                        <p className="text-sm text-muted-foreground">
                          {leave.reason}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={leave.status} />
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(leave)}
                  >
                    <Trash2 className="size-4" />
                    حذف
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Delete confirm */}
      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>حذف مرخصی؟</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? "این عمل مرخصی را برای همیشه حذف می‌کند."
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleteMutation.isPending}
            >
              انصراف
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              حذف
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Status badge with color variants for the three leave states. */
function StatusBadge({ status }: { status: LeaveStatus }) {
  if (status === "approved") return <Badge>تأیید شده</Badge>;
  if (status === "rejected")
    return <Badge variant="destructive">رد شده</Badge>;
  return <Badge variant="secondary">در انتظار</Badge>;
}

/** Empty-state CTA. */
function EmptyState({
  onAdd,
  canAdd,
}: {
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
        <CalendarOff className="size-6" />
      </div>
      <h3 className="text-sm font-medium">مرخصی‌ای یافت نشد</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {canAdd
          ? "اولین مرخصی را ثبت کنید."
          : "ابتدا یک پزشک اضافه کنید تا بتوانید مرخصی ثبت کنید."}
      </p>
      {canAdd && (
        <Button className="mt-4" onClick={onAdd}>
          <Plus className="size-4" />
          ثبت مرخصی
        </Button>
      )}
    </div>
  );
}
