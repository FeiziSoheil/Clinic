"use client";

/**
 * Admin — receptionists (منشی‌ها) scoped to a specific doctor.
 *
 * Route: `/admin/doctors/[id]/receptionists` where `id` is the DoctorProfile id.
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
  UserPlus,
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
  useAdminDoctorReceptionists,
  useDeleteAdminReceptionist,
} from "@/hooks/useAdminRoster";
import type { AdminReceptionist } from "@/types/admin-roster";
import { ReceptionistForm } from "../../_components/ReceptionistFormDialog";

export default function AdminDoctorReceptionistsPage() {
  const params = useParams<{ id: string }>();
  const profileId = params?.id;
  const { openDrawer, closeDrawer } = usePanelDrawer();
  const { data: doctor, isLoading: doctorLoading } = useAdminDoctor(profileId);
  const doctorUserId = doctor?.user_id;
  const { data: receptionists, isLoading, isError } =
    useAdminDoctorReceptionists(doctorUserId);
  const deleteMutation = useDeleteAdminReceptionist(doctorUserId);

  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AdminReceptionist | null>(
    null,
  );

  const filtered = useMemo(() => {
    const list = receptionists ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay =
        `${r.first_name} ${r.last_name} ${r.phone} ${r.username ?? ""} ${r.national_code}`.toLowerCase();
      return hay.includes(q);
    });
  }, [receptionists, search]);

  const doctorName = doctor
    ? `${doctor.first_name} ${doctor.last_name}`
    : "پزشک";

  function openCreate() {
    openDrawer({
      title: "افزودن منشی",
      description: "حساب منشی جدید برای این پزشک ساخته می‌شود.",
      content: (
        <ReceptionistForm
          doctorUserId={doctorUserId}
          receptionist={null}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }
  function openEdit(receptionist: AdminReceptionist) {
    openDrawer({
      title: "ویرایش منشی",
      description:
        "اطلاعات منشی را ویرایش کنید. رمز عبور را خالی بگذارید تا تغییر نکند.",
      content: (
        <ReceptionistForm
          doctorUserId={doctorUserId}
          receptionist={receptionist}
          onDone={closeDrawer}
          onCancel={closeDrawer}
        />
      ),
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await deleteMutation.mutateAsync(deleteTarget.id);
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
              منشی‌های {doctorLoading ? "…" : doctorName}
            </h1>
            <p className="text-sm text-muted-foreground">
              مدیریت منشی‌های متصل به این پزشک.
            </p>
          </div>
        </div>
        <Button onClick={openCreate} disabled={!doctorUserId}>
          <Plus className="size-4" />
          افزودن منشی
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="جستجو نام، موبایل یا نام کاربری…"
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
          بارگذاری فهرست منشی‌ها ناموفق بود.
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
                  <TableHead>نام کاربری</TableHead>
                  <TableHead>موبایل</TableHead>
                  <TableHead>کد ملی</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.first_name} {r.last_name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span dir="ltr">{r.username || "—"}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span dir="ltr">{r.phone}</span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      <span dir="ltr">{r.national_code}</span>
                    </TableCell>
                    <TableCell>
                      <RowActions
                        onEdit={() => openEdit(r)}
                        onDelete={() => setDeleteTarget(r)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="grid gap-3 sm:hidden">
            {filtered.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {r.first_name} {r.last_name}
                      </p>
                      <p className="text-sm text-muted-foreground" dir="ltr">
                        {r.username || "—"} · {r.phone}
                      </p>
                    </div>
                    <RowActions
                      onEdit={() => openEdit(r)}
                      onDelete={() => setDeleteTarget(r)}
                    />
                  </div>
                  <p className="text-sm text-muted-foreground" dir="ltr">
                    کد ملی: {r.national_code}
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
            <DialogTitle>حذف منشی؟</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `این عمل حساب ${deleteTarget.first_name} ${deleteTarget.last_name} را برای همیشه حذف می‌کند.`
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

function RowActions({
  onEdit,
  onDelete,
}: {
  onEdit: () => void;
  onDelete: () => void;
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
          <DropdownMenuItem variant="destructive" onClick={onDelete}>
            <Trash2 className="size-4" />
            حذف
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
        <UserPlus className="size-6" />
      </div>
      <h3 className="text-sm font-medium">
        {hasSearch ? "نتیجه‌ای یافت نشد" : "منشی‌ای ثبت نشده است"}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {hasSearch
          ? "عبارت جستجو را تغییر دهید."
          : "با افزودن اولین منشی شروع کنید."}
      </p>
      {!hasSearch && (
        <Button className="mt-4" onClick={onAdd}>
          <Plus className="size-4" />
          افزودن منشی
        </Button>
      )}
    </div>
  );
}
