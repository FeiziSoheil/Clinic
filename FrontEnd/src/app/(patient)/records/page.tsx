"use client";

/**
 * Patient EHR (medical records) viewer page.
 *
 * Route: `/records`.
 *
 * Lets an authenticated patient browse their own medical-record history. The
 * data comes from {@link usePatientEhr}, which calls
 * `GET /v1/ehr/medical-records/patient/:patientId` and returns the patient-view
 * {@link MedicalRecordResponse}. The patient-view type deliberately omits
 * `private_notes` (doctor-only), so this page can never leak confidential
 * notes by design.
 */

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ClipboardList,
  FileText,
  Stethoscope,
  CalendarClock,
  Pill,
  HeartPulse,
  NotebookPen,
} from "lucide-react";

import { RequireAuth } from "@/components/shared/RequireAuth";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { usePatientEhr } from "@/hooks/useEhr";
import { useAuthStore } from "@/store/authStore";
import type { MedicalRecordResponse } from "@/types/ehr";
import { formatJalaliLabel } from "@/lib/jalali";
import { cn } from "@/lib/utils";

/**
 * Wrap the single-record response (the backend's ListByPatient returns many,
 * but {@link fetchPatientEhr} currently surfaces only the latest) in an array
 * so the page can render a generic expandable-card list regardless of how many
 * records exist.
 */
function asList(record: MedicalRecordResponse | null | undefined) {
  if (!record) return [];
  return [record];
}

/** Format an ISO timestamp as a readable Jalali date label. */
function formatVisitDate(iso: string): string {
  try {
    return formatJalaliLabel(iso.slice(0, 10), "long");
  } catch {
    return iso;
  }
}

export default function PatientRecordsPage() {
  return (
    <RequireAuth allowedRoles={["PATIENT"]}>
      <PatientRecordsContent />
    </RequireAuth>
  );
}

function PatientRecordsContent() {
  const userId = useAuthStore((s) => s.user?.id);
  const { data, isLoading, isError, error } = usePatientEhr(userId);

  const records = useMemo(() => asList(data), [data]);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {/* Page title */}
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">سوابق پزشکی من</h1>
        <p className="text-sm text-muted-foreground">
          تاریخچهٔ ویزیت‌ها، تشخیص‌ها و نسخه‌های پزشکی شما را در اینجا مشاهده
          کنید.
        </p>
      </header>

      {/* Loading */}
      {isLoading && <RecordsSkeleton />}

      {/* Error */}
      {!isLoading && isError && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-destructive">
              <HeartPulse className="size-4" />
              خطا در دریافت سوابق پزشکی
            </CardTitle>
            <CardDescription>
              {(error as Error)?.message ??
                "دریافت اطلاعات با مشکل مواجه شد. لطفاً کمی بعد دوباره تلاش کنید."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      {/* Empty */}
      {!isLoading && !isError && records.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <ClipboardList className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">هنوز سابقهٔ پزشکی ثبت نشده است</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              پس از اولین ویزیت، سوابق پزشکی شما توسط پزشک در این صفحه نمایش
              داده می‌شود.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Records list */}
      {!isLoading && !isError && records.length > 0 && (
        <div className="flex flex-col gap-4">
          {records.map((record) => (
            <RecordCard key={record.id} record={record} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Loading skeleton for the records list. */
function RecordsSkeleton() {
  return (
    <div className="space-y-4">
      {[0, 1].map((i) => (
        <Card key={i}>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="mt-1 h-4 w-24" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/** A single expandable medical-record card. */
function RecordCard({ record }: { record: MedicalRecordResponse }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Stethoscope className="size-4 text-primary" />
              {formatVisitDate(record.created_at)}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <span>پزشک معالج</span>
              <span className="font-medium text-foreground">
                {record.doctor_id}
              </span>
            </CardDescription>
          </div>
          <Badge variant="secondary" className="w-fit">
            ویزیت
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Diagnosis — always visible */}
        <RecordField icon={<FileText className="size-4" />} label="تشخیص">
          {record.diagnosis || "—"}
        </RecordField>

        {/* Prescription — always visible */}
        <RecordField icon={<Pill className="size-4" />} label="نسخه">
          {record.prescription || "—"}
        </RecordField>

        {/* Expandable detail: symptoms + notes */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex min-h-11 w-full items-center justify-between rounded-md px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center gap-1.5">
            <NotebookPen className="size-4" />
            {expanded ? "بستن جزئیات" : "مشاهدهٔ جزئیات بیشتر"}
          </span>
          <ChevronDown
            className={cn(
              "size-4 transition-transform",
              expanded && "rotate-180",
            )}
          />
        </button>

        {expanded && (
          <div className="space-y-3 border-t pt-3">
            <RecordField icon={<HeartPulse className="size-4" />} label="علائم">
              {record.symptoms || "—"}
            </RecordField>
            <RecordField
              icon={<CalendarClock className="size-4" />}
              label="شناسهٔ ویزیت"
            >
              {record.appointment_id || "—"}
            </RecordField>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** A labelled record field row with a leading icon. */
function RecordField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="whitespace-pre-wrap text-sm leading-relaxed">{children}</p>
    </div>
  );
}
