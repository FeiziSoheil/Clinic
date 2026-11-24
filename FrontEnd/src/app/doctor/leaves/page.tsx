"use client";

/**
 * Doctor — Leave Management.
 *
 * Route: `/doctor/leaves`.
 *
 * Lists the signed-in doctor's own leaves in a table (date, reason) with a
 * "ثبت مرخصی" create dialog and a per-row delete action. Mirrors the admin
 * leaves page styling but is scoped to the signed-in doctor via the auth store.
 * Reuses the existing [`useLeaves`](src/hooks/useLeaves.ts) hook (which already
 * supports a `doctorId` filter).
 */

import { useMemo, useState } from "react";
import { CalendarOff, Loader2, Plus, Trash2 } from "lucide-react";

import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDeleteLeave, useLeaves } from "@/hooks/useLeaves";
import { useAuthStore } from "@/store/authStore";
import { formatJalaliLabel } from "@/lib/jalali";
import { LeaveForm } from "./_components/LeaveFormDialog";

export default function DoctorLeavesPage() {
  const doctorId = useAuthStore((s) => s.user?.id) ?? "";
  const { openDrawer, closeDrawer } = usePanelDrawer();

  const { data: leaves, isLoading, isError, error } = useLeaves(doctorId);
  const deleteMutation = useDeleteLeave();

  const [deleteId, setDeleteId] = useState<string | null>(null);

  function openCreateLeave() {
    openDrawer({
      title: "ثبت مرخصی",
      description: "یک مرخصی برای روز مشخص ثبت کنید.",
      content: (
        <LeaveForm
          doctorId={doctorId}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }

  /** Sort leaves newest-first by date. */
  const sortedLeaves = useMemo(() => {
    return [...(leaves ?? [])].sort((a, b) =>
      (b.start_date ?? "").localeCompare(a.start_date ?? ""),
    );
  }, [leaves]);

  async function handleDelete() {
    if (!deleteId) return;
    await deleteMutation.mutateAsync(deleteId);
    setDeleteId(null);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CalendarOff className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">مرخصی‌های من</h1>
            <p className="text-sm text-muted-foreground">
              ثبت و مدیریت مرخصی‌های خود.
            </p>
          </div>
        </div>
        <Button onClick={openCreateLeave}>
          <Plus className="size-4" />
          ثبت مرخصی
        </Button>
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
      ) : sortedLeaves.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <CalendarOff className="size-8 text-muted-foreground" />
            <p className="font-medium">هنوز مرخصی ثبت نشده است.</p>
            <p className="text-sm text-muted-foreground">
              با دکمهٔ «ثبت مرخصی» یک مرخصی جدید ثبت کنید.
            </p>
            <Button className="mt-2" onClick={openCreateLeave}>
              <Plus className="size-4" />
              ثبت مرخصی
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>تاریخ</TableHead>
                <TableHead>دلیل</TableHead>
                <TableHead className="text-end">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedLeaves.map((leave) => (
                <TableRow key={leave.id}>
                  <TableCell className="font-medium tabular-nums">
                    {leave.start_date
                      ? formatJalaliLabel(leave.start_date, "full")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {leave.reason || "—"}
                  </TableCell>
                  <TableCell className="text-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="size-8 p-0 text-destructive hover:text-destructive"
                      aria-label="حذف مرخصی"
                      disabled={deleteMutation.isPending}
                      onClick={() => setDeleteId(leave.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardContent className="space-y-4 p-6 text-center">
              <p className="font-medium">حذف مرخصی؟</p>
              <p className="text-sm text-muted-foreground">
                این مرخصی حذف می‌شود. این عمل قابل بازگشت نیست.
              </p>
              <div className="flex justify-center gap-2">
                <Button variant="outline" onClick={() => setDeleteId(null)}>
                  انصراف
                </Button>
                <Button
                  variant="destructive"
                  disabled={deleteMutation.isPending}
                  onClick={handleDelete}
                >
                  {deleteMutation.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  حذف
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </div>
  );
}
