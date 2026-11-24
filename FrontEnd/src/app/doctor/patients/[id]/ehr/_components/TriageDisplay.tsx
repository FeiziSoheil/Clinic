"use client";

/**
 * TriageDisplay — read-only view of the triage note(s) linked to an
 * appointment (via {@link useAppointmentTriage}).
 *
 * Renders the newest note first: symptoms as badges, vitals in a tidy grid,
 * notes block, and the creation timestamp (Jalali). Includes an "افزودن/ویرایش"
 * affordance that lets the parent swap to the {@link TriageForm} via `onEdit`.
 */

import { Activity, Loader2, Stethoscope } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useAppointmentTriage } from "@/hooks/useEhr";
import { formatJalaliDateTime } from "@/lib/jalali";
import type { Vitals } from "@/types/ehr";

export interface TriageDisplayProps {
  appointmentId: string;
  onEdit?: () => void;
}

interface VitalMeta {
  key: keyof Vitals;
  label: string;
  suffix?: string;
}

const VITAL_FIELDS: VitalMeta[] = [
  { key: "blood_pressure", label: "فشار خون" },
  { key: "heart_rate", label: "ضربان قلب", suffix: "bpm" },
  { key: "temperature", label: "دما", suffix: "°C" },
  { key: "respiratory_rate", label: "تنفس", suffix: "/min" },
  { key: "oxygen_saturation", label: "اشباع O₂", suffix: "٪" },
  { key: "weight", label: "وزن", suffix: "kg" },
  { key: "height", label: "قد", suffix: "cm" },
];

export function TriageDisplay({ appointmentId, onEdit }: TriageDisplayProps) {
  const triageQuery = useAppointmentTriage(appointmentId);

  if (triageQuery.isLoading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const notes = triageQuery.data ?? [];
  const latest = notes[0];

  if (!latest) {
    return (
      <Card>
        <CardHeader className="flex-row items-center gap-2">
          <Stethoscope className="size-5 text-muted-foreground" />
          <CardTitle className="text-lg">یادداشت تریاژ</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            برای این نوبت هنوز یادداشت تریاژی ثبت نشده است.
          </p>
          {onEdit && (
            <Button onClick={onEdit} variant="secondary">
              ثبت یادداشت تریاژ
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const recordedVitals = VITAL_FIELDS.filter((f) => latest.vitals?.[f.key] != null);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" />
          <CardTitle className="text-lg">یادداشت تریاژ</CardTitle>
        </div>
        {onEdit && (
          <Button onClick={onEdit} variant="outline" size="sm">
            ویرایش
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          ثبت‌شده در {formatJalaliDateTime(latest.created_at)}
        </p>

        {latest.symptoms.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">علائم</h4>
            <div className="flex flex-wrap gap-1.5">
              {latest.symptoms.map((s) => (
                <Badge key={s} variant="secondary">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {recordedVitals.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">علائم حیاتی</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {recordedVitals.map((f) => (
                  <div
                    key={f.key}
                    className="rounded-md border bg-muted/40 px-3 py-2"
                  >
                    <p className="text-xs text-muted-foreground">{f.label}</p>
                    <p className="text-sm font-semibold">
                      {latest.vitals?.[f.key]}
                      {f.suffix ? ` ${f.suffix}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {latest.notes && (
          <>
            <Separator />
            <div className="space-y-1">
              <h4 className="text-sm font-medium">یادداشت‌ها</h4>
              <p className="whitespace-pre-wrap text-sm">{latest.notes}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
