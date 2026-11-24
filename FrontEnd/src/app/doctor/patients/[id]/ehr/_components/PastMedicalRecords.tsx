"use client";

/**
 * PastMedicalRecords — timeline of all SOAP/general medical records for a
 * patient (via {@link usePatientMedicalRecords}).
 *
 * Each record renders as a card with its date (Jalali), a record-type badge
 * (SOAP vs GENERAL), the doctor id, and either the four SOAP sections or the
 * legacy symptoms/diagnosis/prescription fields. Records are shown newest-first.
 */

import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePatientMedicalRecords } from "@/hooks/useEhr";
import { formatJalaliDateTime } from "@/lib/jalali";
import type { MedicalRecordResponse } from "@/types/ehr";

export interface PastMedicalRecordsProps {
  patientId: string;
}

function SoapSection({ label, content }: { label: string; content?: string }) {
  if (!content) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm">{content}</p>
    </div>
  );
}

function GeneralSection({ label, content }: { label: string; content?: string }) {
  if (!content) return null;
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="whitespace-pre-wrap text-sm">{content}</p>
    </div>
  );
}

function RecordCard({ record }: { record: MedicalRecordResponse }) {
  const isSoap =
    record.record_type === "SOAP" ||
    Boolean(record.subjective || record.objective || record.assessment || record.plan);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">
            {formatJalaliDateTime(record.created_at)}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            پزشک: <span className="font-mono">{record.doctor_id}</span>
          </p>
        </div>
        <Badge variant={isSoap ? "default" : "secondary"}>
          {isSoap ? "SOAP" : "عمومی"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {isSoap ? (
          <>
            <SoapSection label="ذهنی (S)" content={record.subjective} />
            <SoapSection label="عینی (O)" content={record.objective} />
            <SoapSection label="ارزیابی (A)" content={record.assessment} />
            <SoapSection label="طرح درمان (P)" content={record.plan} />
          </>
        ) : (
          <>
            <GeneralSection label="علائم" content={record.symptoms} />
            <GeneralSection label="تشخیص" content={record.diagnosis} />
            <GeneralSection label="نسخه" content={record.prescription} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function PastMedicalRecords({ patientId }: PastMedicalRecordsProps) {
  const recordsQuery = usePatientMedicalRecords(patientId);

  if (recordsQuery.isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (recordsQuery.isError) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-destructive">
          <Loader2 className="size-4" />
          بارگذاری پرونده‌های پزشکی ناموفق بود.
        </CardContent>
      </Card>
    );
  }

  const records = [...(recordsQuery.data ?? [])].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            هیچ پرونده پزشکی ثبت نشده است.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {records.map((r) => (
        <RecordCard key={r.id} record={r} />
      ))}
    </div>
  );
}
