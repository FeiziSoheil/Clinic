"use client";

/**
 * Patient prescriptions viewer page.
 *
 * Route: `/prescriptions`.
 *
 * Lets an authenticated patient browse every prescription issued to them by
 * their doctors. Data comes from {@link usePrescriptionsByPatient}, which calls
 * `GET /v1/prescriptions/patient/:patientId` and returns the patient-safe
 * {@link PrescriptionResponse} (the doctor-only `notes` field is never present).
 *
 * Each prescription is rendered as a card with its status badge, Jalali issue
 * date, a table of drug items and a "دانلود PDF" button backed by
 * {@link exportPrescriptionPdf}.
 */

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Download, FileText, Pill } from "lucide-react";
import { toast } from "sonner";

import { RequireAuth } from "@/components/shared/RequireAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { usePrescriptionsByPatient } from "@/hooks/usePrescriptions";
import { formatJalaliDateTime } from "@/lib/jalali";
import { exportPrescriptionPdf } from "@/lib/prescription-pdf";
import { useAuthStore } from "@/store/authStore";
import type {
  PrescriptionResponse,
  PrescriptionStatus,
} from "@/types/prescription";

/** Persian labels + badge variant for each prescription status. */
const STATUS_META: Record<
  PrescriptionStatus,
  { label: string; variant: "default" | "secondary" | "destructive" }
> = {
  ACTIVE: { label: "فعال", variant: "default" },
  COMPLETED: { label: "تکمیل شده", variant: "secondary" },
  CANCELLED: { label: "لغو شده", variant: "destructive" },
};

export default function PatientPrescriptionsPage() {
  return (
    <RequireAuth allowedRoles={["PATIENT"]}>
      <PatientPrescriptionsContent />
    </RequireAuth>
  );
}

function PatientPrescriptionsContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams.get("id");
  const patientId = useAuthStore((s) => s.user?.id);
  const { data, isLoading, isError, error } =
    usePrescriptionsByPatient(patientId);

  const prescriptions = data ?? [];
  const scrolledRef = useRef(false);

  // When opened from an SMS deep link, scroll to the referenced prescription.
  useEffect(() => {
    if (!highlightId || isLoading || scrolledRef.current) return;
    const el = document.getElementById(`prescription-${highlightId}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      scrolledRef.current = true;
    }
  }, [highlightId, isLoading, prescriptions]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Page title */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">نسخه‌های من</h1>
        <p className="text-sm text-muted-foreground">
          نسخه‌های الکترونیکی که پزشکان برای شما صادر کرده‌اند را در اینجا
          مشاهده و دانلود کنید.
        </p>
      </header>

      {/* Loading */}
      {isLoading && <PrescriptionsSkeleton />}

      {/* Error */}
      {!isLoading && isError && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <Pill className="size-4" />
              خطا در دریافت نسخه‌ها
            </CardTitle>
            <CardDescription>
              {(error as Error)?.message ??
                "دریافت اطلاعات با مشکل مواجه شد. لطفاً کمی بعد دوباره تلاش کنید."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !isError && prescriptions.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <FileText className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">
              هنوز نسخه‌ای برای شما صادر نشده است
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              پس از ویزیت، نسخه‌های الکترونیکی پزشک شما در این صفحه نمایش داده
              می‌شود.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Prescriptions list */}
      {!isLoading && !isError && prescriptions.length > 0 && (
        <div className="flex flex-col gap-4">
          {prescriptions.map((prescription) => (
            <PrescriptionCard
              key={prescription.id}
              prescription={prescription}
              highlighted={prescription.id === highlightId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Loading skeleton for the prescriptions list. */
function PrescriptionsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-1 h-4 w-24" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A single prescription card. */
function PrescriptionCard({
  prescription,
  highlighted = false,
}: {
  prescription: PrescriptionResponse;
  highlighted?: boolean;
}) {
  const status = STATUS_META[prescription.status];

  return (
    <Card
      id={`prescription-${prescription.id}`}
      className={
        highlighted
          ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
          : undefined
      }
    >
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="size-4 text-primary" />
              نسخهٔ الکترونیک
            </CardTitle>
            <CardDescription>
              تاریخ صدور: {formatJalaliDateTime(prescription.created_at)}
            </CardDescription>
          </div>
          <Badge variant={status.variant} className="w-fit">
            {status.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {prescription.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">موردی ثبت نشده است.</p>
        ) : (
          <>
            {/* Mobile: one drug per stacked block */}
            <ul className="flex flex-col gap-3 md:hidden">
              {prescription.items.map((item, idx) => (
                <li
                  key={`${item.drug_name}-${idx}`}
                  className="rounded-lg border bg-muted/20 p-3"
                >
                  <p className="font-medium">{item.drug_name || "—"}</p>
                  <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">دوز</dt>
                      <dd>{item.dose || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">دفعات</dt>
                      <dd>{item.frequency || "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">مدت</dt>
                      <dd>{item.duration || "—"}</dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground">
                        دستور مصرف
                      </dt>
                      <dd className="break-words">{item.sig || "—"}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>

            {/* md+: table layout */}
            <div className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">نام دارو</TableHead>
                    <TableHead className="text-right">دوز</TableHead>
                    <TableHead className="text-right">دفعات</TableHead>
                    <TableHead className="text-right">مدت</TableHead>
                    <TableHead className="text-right">دستور مصرف</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prescription.items.map((item, idx) => (
                    <TableRow key={`${item.drug_name}-${idx}`}>
                      <TableCell className="font-medium">
                        {item.drug_name || "—"}
                      </TableCell>
                      <TableCell>{item.dose || "—"}</TableCell>
                      <TableCell>{item.frequency || "—"}</TableCell>
                      <TableCell>{item.duration || "—"}</TableCell>
                      <TableCell>{item.sig || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="justify-stretch sm:justify-end">
        <DownloadPdfButton prescription={prescription} />
      </CardFooter>
    </Card>
  );
}

/** "دانلود PDF" button wired to {@link exportPrescriptionPdf} with error toast. */
function DownloadPdfButton({
  prescription,
}: {
  prescription: PrescriptionResponse;
}) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      await exportPrescriptionPdf(prescription);
    } catch (err) {
      toast.error("دانلود نسخه ناموفق بود.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="min-h-10 w-full sm:w-auto"
      disabled={pending}
      onClick={handleClick}
    >
      <Download className="size-4" />
      دانلود PDF
    </Button>
  );
}
