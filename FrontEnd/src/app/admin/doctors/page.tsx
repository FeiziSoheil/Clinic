"use client";

/**
 * Admin Doctors management page.
 *
 * Lists doctors in a responsive shadcn table with a client-side search, an
 * "Add Doctor" dialog, per-row actions (Edit / Manage Shifts / Delete with a
 * confirm), loading skeletons and an empty state.
 *
 * On small screens the table scrolls horizontally (mobile-first); a stacked
 * card layout is provided below the breakpoint via the `sm:hidden` block.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarClock,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Stethoscope,
  Trash2,
  UserPlus,
  Users,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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
  useAdminDoctors,
  useDeleteDoctor,
} from "@/hooks/useAdminDoctors";
import { COMMON_SPECIALTIES } from "@/lib/admin-doctor-api";
import type { AdminDoctor } from "@/types/admin-doctor";
import { DoctorForm } from "./_components/DoctorFormDialog";
import { ShiftsPanel } from "./_components/ShiftsDialog";

export default function AdminDoctorsPage() {
  const [search, setSearch] = useState("");
  const { openDrawer, closeDrawer } = usePanelDrawer();
  // Client-side search term fed into the query filter.
  const { data: doctors, isLoading, isError, error } = useAdminDoctors(
    search ? { search } : undefined,
  );
  const deleteMutation = useDeleteDoctor();

  const [deleteTarget, setDeleteTarget] = useState<AdminDoctor | null>(null);

  const filtered = useMemo(() => doctors ?? [], [doctors]);

  function openCreate() {
    openDrawer({
      title: "افزودن پزشک",
      description: "یک حساب پزشک و پروفایل حرفه‌ای جدید ایجاد کنید.",
      content: (
        <DoctorForm
          specialties={COMMON_SPECIALTIES}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }
  function openEdit(doc: AdminDoctor) {
    openDrawer({
      title: "ویرایش پزشک",
      description: "اطلاعات حساب و پروفایل پزشک را به‌روزرسانی کنید.",
      content: (
        <DoctorForm
          doctor={doc}
          specialties={COMMON_SPECIALTIES}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }
  function openShifts(doc: AdminDoctor) {
    openDrawer({
      title: "شیفت‌های هفتگی",
      description: `مدیریت شیفت‌های تکرارشوندهٔ ${doc.first_name} ${doc.last_name}.`,
      content: <ShiftsPanel doctor={doc} onCancel={closeDrawer} />,
    });
  }

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
          <h1 className="text-2xl font-semibold tracking-tight">پزشکان</h1>
          <p className="text-sm text-muted-foreground">
            مدیریت پزشکان، مدت ویزیت و شیفت‌های هفتگی.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          افزودن پزشک
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
       <Input
         value={search}
         onChange={(e) => setSearch(e.target.value)}
         placeholder="جست‌وجو نام، تخصص، تلفن…"
         className="pl-9"
       />
      </div>

      {/* Error banner */}
      {isError && (
       <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
         بارگذاری پزشکان ناموفق بود:{" "}
         {error instanceof Error ? error.message : "خطای ناشناخته"}
       </div>
     )}

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={openCreate} />
      ) : (
        <>
          {/* Desktop / tablet table */}
          <div className="hidden overflow-x-auto rounded-md border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>تلفن</TableHead>
                  <TableHead>تخصص</TableHead>
                  <TableHead className="text-end">منشی‌ها</TableHead>
                  <TableHead className="text-end">بیماران</TableHead>
                  <TableHead className="text-end">ویزیت (دقیقه)</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead className="text-end">عملیات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((doc) => (
                  <TableRow key={doc.id}>
                    <TableCell className="font-medium">
                      {doc.first_name} {doc.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {doc.phone}
                    </TableCell>
                    <TableCell>{doc.specialty}</TableCell>
                    <TableCell className="text-end tabular-nums">
                      <Link
                        href={`/admin/doctors/${doc.id}/receptionists`}
                        className="text-foreground underline-offset-4 hover:underline"
                      >
                        {doc.receptionist_count}
                      </Link>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <Link
                        href={`/admin/doctors/${doc.id}/patients`}
                        className="text-foreground underline-offset-4 hover:underline"
                      >
                        {doc.patient_count}
                      </Link>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      {doc.visit_duration_minutes}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={doc.status} />
                    </TableCell>
                    <TableCell className="text-end">
                      <RowActions
                        doc={doc}
                        onEdit={openEdit}
                        onShifts={openShifts}
                        onDelete={setDeleteTarget}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile stacked cards */}
          <div className="grid grid-cols-1 gap-3 sm:hidden">
            {filtered.map((doc) => (
              <Card key={doc.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {doc.first_name} {doc.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {doc.specialty}
                      </p>
                    </div>
                    <StatusBadge status={doc.status} />
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{doc.phone}</span>
                    <span className="tabular-nums">
                      ویزیت {doc.visit_duration_minutes} دقیقه‌ای
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <Link
                      href={`/admin/doctors/${doc.id}/receptionists`}
                      className="hover:underline"
                    >
                      منشی‌ها {doc.receptionist_count}
                    </Link>
                    <Link
                      href={`/admin/doctors/${doc.id}/patients`}
                      className="hover:underline"
                    >
                      بیماران {doc.patient_count}
                    </Link>
                  </div>
                  <RowActions
                    doc={doc}
                    onEdit={openEdit}
                    onShifts={openShifts}
                    onDelete={setDeleteTarget}
                  />
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
            <DialogTitle>حذف پزشک؟</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `این عمل ${deleteTarget.first_name} ${deleteTarget.last_name} و شیفت‌های هفتگی او را برای همیشه حذف می‌کند.`
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

/** Status badge with color variants. */
function StatusBadge({ status }: { status: AdminDoctor["status"] }) {
  return status === "ACTIVE" ? (
    <Badge>فعال</Badge>
  ) : (
    <Badge variant="secondary">غیرفعال</Badge>
  );
}

/** Per-row actions dropdown. */
function RowActions({
  doc,
  onEdit,
  onShifts,
  onDelete,
}: {
  doc: AdminDoctor;
  onEdit: (doc: AdminDoctor) => void;
  onShifts: (doc: AdminDoctor) => void;
  onDelete: (doc: AdminDoctor) => void;
}) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="sm" className="size-8 p-0" />
          }
        >
          <MoreHorizontal className="size-4" />
          <span className="sr-only">باز کردن عملیات</span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>عملیات</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onEdit(doc)}>
            <Pencil className="size-4" />
            ویرایش
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onShifts(doc)}>
            <CalendarClock className="size-4" />
            مدیریت شیفت‌ها
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link href={`/admin/doctors/${doc.id}/patients`} />
            }
          >
            <Users className="size-4" />
            بیماران
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link href={`/admin/doctors/${doc.id}/receptionists`} />
            }
          >
            <UserPlus className="size-4" />
            منشی‌ها
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onDelete(doc)}
          >
            <Trash2 className="size-4" />
            حذف
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/** Empty-state CTA. */
function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
        <Stethoscope className="size-6" />
      </div>
      <h3 className="text-sm font-medium">پزشکی یافت نشد</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        با افزودن اولین پزشک شروع کنید.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="size-4" />
        افزودن پزشک
      </Button>
    </div>
  );
}
