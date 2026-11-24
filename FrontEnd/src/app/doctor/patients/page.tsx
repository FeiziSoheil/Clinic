"use client";

/**
 * Doctor — My Patients list (بیماران من).
 *
 * Route: `/doctor/patients`.
 *
 * Lists every patient the signed-in doctor has ever seen, sourced from the
 * `GET /api/v1/ehr/doctor/patients` endpoint (bare JSON array, sorted by
 * `last_visit` desc). Each row links to the patient's EHR page at
 * `/doctor/patients/{patient_id}/ehr`.
 *
 * Features:
 * - Client-side search/filter by name / phone / national code.
 * - Loading skeleton, error state (with retry) and an empty state.
 * - A count badge of total patients in the header.
 *
 * The visual language mirrors the doctor queue page
 * ([`doctor/queue/page.tsx`](src/app/doctor/queue/page.tsx)): same Card /
 * Table / Skeleton / empty-state styling, RTL layout and Persian labels.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  FileText,
  Search,
  Users,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { formatJalali } from "@/lib/jalali";
import { useDoctorPatients } from "@/hooks/useEhr";
import { toPersianDigits } from "@/lib/jalali";
import type { DoctorPatientSummary } from "@/types/ehr";

/** Truncate `text` to `max` characters, appending an ellipsis when cut. */
function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/** Format a nullable `last_visit` ISO timestamp as a Jalali Persian date. */
function formatLastVisit(iso: string | null): string {
  if (!iso) return "—";
  // `last_visit` is a full ISO timestamp; `formatJalali` takes the date part.
  return formatJalali(iso.slice(0, 10));
}

export default function DoctorPatientsPage() {
  const [query, setQuery] = useState("");
  const patientsQuery = useDoctorPatients();

  // Toast once when the query transitions to an error.
  useEffect(() => {
    if (patientsQuery.isError) {
      toast.error("بارگذاری فهرست بیماران ناموفق بود.", {
        description:
          (patientsQuery.error as Error)?.message ??
          "لطفاً دوباره تلاش کنید.",
      });
    }
  }, [patientsQuery.isError, patientsQuery.error]);

  const patients = useMemo(
    () => patientsQuery.data ?? [],
    [patientsQuery.data],
  );

  /** Filter by name / phone / national code (case-insensitive). */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => {
      const name = `${p.first_name} ${p.last_name}`.toLowerCase();
      return (
        name.includes(q) ||
        p.phone.toLowerCase().includes(q) ||
        p.national_code.toLowerCase().includes(q)
      );
    });
  }, [patients, query]);

  const isLoading = patientsQuery.isLoading;
  const isError = patientsQuery.isError;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Users className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">بیماران من</h1>
            <p className="text-sm text-muted-foreground">
              فهرست تمام بیمارانی که تاکنون ویزیت کرده‌اید.
            </p>
          </div>
        </div>
        <Badge variant="secondary" className="h-fit px-3 py-1 text-sm">
          {toPersianDigits(patients.length)} بیمار
        </Badge>
      </div>

      {/* Search */}
      <div className="relative max-w-sm flex-1">
        <Search className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو بر اساس نام، شماره تماس یا کد ملی..."
          className="pr-9"
        />
      </div>

      {/* States */}
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">بارگذاری فهرست بیماران ممکن نشد.</p>
              <p className="text-sm text-muted-foreground">
                {(patientsQuery.error as Error)?.message ??
                  "لطفاً دوباره تلاش کنید."}
              </p>
            </div>
            <Button variant="outline" onClick={() => patientsQuery.refetch()}>
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
            <Users className="size-8 text-muted-foreground" />
            <p className="font-medium">
              {query
                ? "بیماری با این مشخصات یافت نشد."
                : "هنوز بیماری ثبت نشده است."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-md border sm:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>نام و نام خانوادگی</TableHead>
                  <TableHead>شماره تماس</TableHead>
                  <TableHead>کد ملی</TableHead>
                  <TableHead className="w-28">تعداد مراجعه</TableHead>
                  <TableHead className="w-32">ویزیت‌های تکمیل‌شده</TableHead>
                  <TableHead className="w-36">آخرین مراجعه</TableHead>
                  <TableHead>آخرین تشخیص</TableHead>
                  <TableHead className="text-end">پرونده</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <PatientRow key={p.patient_id} patient={p} />
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 sm:hidden">
            {filtered.map((p) => (
              <PatientCard key={p.patient_id} patient={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Build the EHR route for a patient. */
function ehrHref(patientId: string): string {
  return `/doctor/patients/${patientId}/ehr`;
}

/** A single desktop table row linking into the patient's EHR. */
function PatientRow({ patient }: { patient: DoctorPatientSummary }) {
  const router = useRouter();
  return (
    <TableRow className="cursor-pointer">
      <TableCell className="font-medium">
        <Link
          href={`/doctor/patients/${patient.patient_id}/ehr`}
          className="after:absolute after:inset-0"
        >
          {patient.first_name} {patient.last_name}
        </Link>
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {patient.phone}
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {patient.national_code}
      </TableCell>
      <TableCell className="tabular-nums">
        {toPersianDigits(patient.total_visits)}
      </TableCell>
      <TableCell className="tabular-nums">
        {toPersianDigits(patient.completed_visits)}
      </TableCell>
      <TableCell className="tabular-nums text-muted-foreground">
        {formatLastVisit(patient.last_visit)}
      </TableCell>
      <TableCell className="max-w-[200px] truncate text-muted-foreground">
        {patient.last_diagnosis
          ? truncate(patient.last_diagnosis, 40)
          : "—"}
      </TableCell>
      <TableCell className="relative z-10 text-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => router.push(ehrHref(patient.patient_id))}
        >
          <FileText className="size-4" />
          پرونده
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** A single mobile card linking into the patient's EHR. */
function PatientCard({ patient }: { patient: DoctorPatientSummary }) {
  const router = useRouter();
  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium">
              {patient.first_name} {patient.last_name}
            </p>
            <p className="text-xs text-muted-foreground">
              {patient.last_diagnosis
                ? truncate(patient.last_diagnosis, 50)
                : "بدون تشخیص ثبت‌شده"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => router.push(ehrHref(patient.patient_id))}
          >
            <FileText className="size-4" />
            پرونده
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="tabular-nums">{patient.phone}</span>
          <span className="tabular-nums">کد ملی: {patient.national_code}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span>
            مراجعه: {toPersianDigits(patient.total_visits)} / تکمیل‌شده:{" "}
            {toPersianDigits(patient.completed_visits)}
          </span>
          <span className="text-muted-foreground">
            آخرین مراجعه: {formatLastVisit(patient.last_visit)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
