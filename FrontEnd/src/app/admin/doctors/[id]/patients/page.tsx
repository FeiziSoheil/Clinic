"use client";

/**
 * Admin — patients assigned to a specific doctor.
 *
 * Route: `/admin/doctors/[id]/patients` where `id` is the DoctorProfile id.
 * API calls use `AdminDoctor.user_id` (EmployerID target).
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";

import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
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
import { useAdminDoctor } from "@/hooks/useAdminDoctors";
import {
  useAdminDoctorPatients,
  useDeleteAdminPatient,
} from "@/hooks/useAdminRoster";
import type { AdminPatient } from "@/types/admin-roster";
import { PatientForm } from "../../_components/PatientFormDialog";

export default function AdminDoctorPatientsPage() {
  const params = useParams<{ id: string }>();
  const profileId = params?.id;
  const { openDrawer, closeDrawer } = usePanelDrawer();
  const { data: doctor, isLoading: doctorLoading } = useAdminDoctor(profileId);
  const doctorUserId = doctor?.user_id;
  const { data: patients, isLoading, isError } =
    useAdminDoctorPatients(doctorUserId);
  const deleteMutation = useDeleteAdminPatient(doctorUserId);

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminPatient | null>(null);
  const [deleteMode, setDeleteMode] = useState<"unlink" | "hard">("unlink");

  const filtered = useMemo(() => {
    const list = patients ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) => {
      const hay = `${p.first_name} ${p.last_name} ${p.phone} ${p.national_code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [patients, search]);

  const doctorName = doctor
    ? `${doctor.first_name} ${doctor.last_name}`
    : "پزشک";

  function openCreate() {
    openDrawer({
      title: "افزودن بیمار",
      description:
        "بیمار جدید به فهرست این پزشک افزوده می‌شود (ورود با کد یک‌بارمصرف).",
      content: (
        <PatientForm
          doctorUserId={doctorUserId}
          patient={null}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }
  function openEdit(patient: AdminPatient) {
    openDrawer({
      title: "ویرایش بیمار",
      description: "اطلاعات هویتی بیمار را ویرایش کنید.",
      content: (
        <PatientForm
          doctorUserId={doctorUserId}
          patient={patient}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }
  function openDelete(patient: AdminPatient, mode: "unlink" | "hard") {
    setDeleteMode(mode);
    setDeleteTarget(patient);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync({
      patientId: deleteTarget.id,
      mode: deleteMode,
    });
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Link
            href="/admin/doctors"
            className="inline-flex h-7 w-fit items-center gap-1 rounded-lg px-2.5 text-[0.8rem] font-medium text-muted-foreground hover:bg-muted hover:text-foreground -ms-2"
          >
            <ArrowRight className="size-4" />
            بازگشت به پزشکان
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              بیماران {doctorLoading ? "…" : doctorName}
            </h1>
            <p className="text-sm text-muted-foreground">
              مدیریت فهرست بیماران اختصاص‌یافته به این پزشک.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} disabled={!doctorUserId}>
          <Plus className="size-4" />
          افزودن بیمار
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو نام، موبایل یا کد ملی…"
          className="ps-9"
        />
      </div>

      {isLoading || doctorLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          بارگذاری فهرست بیماران ناموفق بود.
        </p>
      ) : filtered.length === 0 ? (
        <EmptyState onAdd={openCreate} hasSearch={Boolean(search.trim())} />
      ) : (
        <>
          <div className="hidden rounded-lg border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام</TableHead>
                  <TableHead>موبایل</TableHead>
                  <TableHead>کد ملی</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.first_name} {p.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span dir="ltr">{p.phone}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span dir="ltr">{p.national_code}</span>
                    </TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(p)}
                        onUnlink={() => openDelete(p, "unlink")}
                        onHardDelete={() => openDelete(p, "hard")}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 sm:hidden">
            {filtered.map((p) => (
              <Card key={p.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {p.first_name} {p.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground" dir="ltr">
                        {p.phone}
                      </p>
                    </div>
                    <RowActions
                      onEdit={() => openEdit(p)}
                      onUnlink={() => openDelete(p, "unlink")}
                      onHardDelete={() => openDelete(p, "hard")}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    کد ملی: {p.national_code}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteMode === "hard"
                ? "حذف کامل حساب بیمار؟"
                : "حذف از فهرست این پزشک؟"}
            </DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? deleteMode === "hard"
                  ? `حساب ${deleteTarget.first_name} ${deleteTarget.last_name} برای همیشه از سیستم حذف می‌شود و از فهرست همه پزشکان نیز ناپدید می‌گردد.`
                  : `${deleteTarget.first_name} ${deleteTarget.last_name} فقط از فهرست این پزشک حذف می‌شود؛ حساب کاربری و ارتباط با سایر پزشکان باقی می‌ماند.`
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
              {deleteMode === "hard" ? "حذف کامل" : "حذف از این پزشک"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RowActions({
  onEdit,
  onUnlink,
  onHardDelete,
}: {
  onEdit: () => void;
  onUnlink: () => void;
  onHardDelete: () => void;
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
          <DropdownMenuItem onClick={onEdit}>
            <Pencil className="size-4" />
            ویرایش
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={onUnlink}>
            <Trash2 className="size-4" />
            حذف از این پزشک
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={onHardDelete}>
            <Trash2 className="size-4" />
            حذف کامل حساب
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function EmptyState({
  onAdd,
  hasSearch,
}: {
  onAdd: () => void;
  hasSearch: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
      <div className="mb-3 rounded-full bg-muted p-3 text-muted-foreground">
        <Users className="size-6" />
      </div>
      <h3 className="text-sm font-medium">
        {hasSearch ? "نتیجه‌ای یافت نشد" : "بیماری ثبت نشده است"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasSearch
          ? "عبارت جستجو را تغییر دهید."
          : "با افزودن اولین بیمار شروع کنید."}
      </p>
      {!hasSearch && (
        <Button className="mt-4" onClick={onAdd}>
          <Plus className="size-4" />
          افزودن بیمار
        </Button>
      )}
    </div>
  );
}
