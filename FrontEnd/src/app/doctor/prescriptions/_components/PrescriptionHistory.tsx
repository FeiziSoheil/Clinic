"use client";

/**
 * PrescriptionHistory — list of issued prescriptions as cards.
 *
 * Mirrors [`PastMedicalRecords.tsx`](../patients/[id]/ehr/_components/PastMedicalRecords.tsx):
 * loading (Skeleton), error, empty and populated states. By default lists the
 * current doctor's prescriptions; when a `patientId` is supplied it narrows to
 * that patient. Each card carries a status badge, a Jalali timestamp, a summary
 * of drug items, a PDF export button and a status-change Select.
 */

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePrescriptionsByDoctor,
  usePrescriptionsByPatient,
  useUpdatePrescriptionStatus,
} from "@/hooks/usePrescriptions";
import { exportPrescriptionPdf } from "@/lib/prescription-pdf";
import { formatJalaliDateTime } from "@/lib/jalali";
import type { PrescriptionResponse, PrescriptionStatus } from "@/types/prescription";

export interface PrescriptionHistoryProps {
  doctorId: string;
  patientId?: string;
}

const STATUS_VARIANT: Record<
  PrescriptionStatus,
  { label: string; className: string }
> = {
  ACTIVE: {
    label: "فعال",
    className:
      "border-green-200 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300",
  },
  COMPLETED: {
    label: "تکمیل‌شده",
    className:
      "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300",
  },
  CANCELLED: {
    label: "لغوشده",
    className:
      "border-red-200 bg-red-100 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300",
  },
};

function PrescriptionCard({
  prescription,
  doctorName,
  patientName,
}: {
  prescription: PrescriptionResponse;
  doctorName?: string;
  patientName?: string;
}) {
  const statusMeta = STATUS_VARIANT[prescription.status];
  const updateStatus = useUpdatePrescriptionStatus();
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    try {
      setDownloading(true);
      await exportPrescriptionPdf(prescription, { doctorName, patientName });
    } catch (err) {
      // Previously only try/finally — html2canvas errors became unhandled
      // rejections. Surface them as a toast so the failure is visible.
      toast.error("دانلود نسخه ناموفق بود.", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {formatJalaliDateTime(prescription.created_at)}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            بیمار: <span className="font-mono">{prescription.patient_id}</span>
          </p>
        </div>
        <Badge variant="outline" className={statusMeta.className}>
          {statusMeta.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1.5">
          {prescription.items.map((it, idx) => (
            <li key={idx} className="text-sm">
              <span className="font-medium">{it.drug_name}</span>
              {it.dose ? ` — ${it.dose}` : ""}
              {it.frequency ? ` — ${it.frequency}` : ""}
              {it.duration ? ` — ${it.duration}` : ""}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap items-end justify-between gap-3 pt-2">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">تغییر وضعیت</Label>
            <Select
              value={prescription.status}
              disabled={updateStatus.isPending}
              onValueChange={(v) =>
                updateStatus.mutate({
                  id: prescription.id,
                  req: { status: v as PrescriptionStatus },
                })
              }
            >
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">فعال</SelectItem>
                <SelectItem value="COMPLETED">تکمیل‌شده</SelectItem>
                <SelectItem value="CANCELLED">لغوشده</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Download className="size-4" />
            )}
            دانلود PDF
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function PrescriptionHistory({
  doctorId,
  patientId,
}: PrescriptionHistoryProps) {
  // Prefer the patient-scoped list when a patient is selected, else the doctor list.
  const doctorQuery = usePrescriptionsByDoctor(doctorId || undefined);
  const patientQuery = usePrescriptionsByPatient(patientId || undefined);

  const activeQuery = patientId ? patientQuery : doctorQuery;

  if (activeQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (activeQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-destructive">
          <Loader2 className="size-4" />
          بارگذاری نسخه‌ها ناموفق بود.
        </CardContent>
      </Card>
    );
  }

  const prescriptions = [...(activeQuery.data ?? [])].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (prescriptions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            هنوز نسخه‌ای صادر نشده است.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {prescriptions.map((p) => (
        <PrescriptionCard key={p.id} prescription={p} />
      ))}
    </div>
  );
}
