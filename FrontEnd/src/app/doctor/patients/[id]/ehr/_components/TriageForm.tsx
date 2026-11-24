"use client";

/**
 * TriageForm — captures a triage note (symptoms, vitals, notes) for a specific
 * appointment and submits it via {@link useCreateTriageNote}.
 *
 * On success the form resets and an optional `onSaved` callback is invoked so
 * the parent page can swap to the {@link TriageDisplay} view.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCreateTriageNote } from "@/hooks/useEhr";
import type { Vitals } from "@/types/ehr";

export interface TriageFormProps {
  patientId: string;
  doctorId: string;
  appointmentId: string;
  onSaved?: () => void;
}

interface VitalsState {
  blood_pressure: string;
  heart_rate: string;
  temperature: string;
  respiratory_rate: string;
  oxygen_saturation: string;
  weight: string;
  height: string;
}

const EMPTY_VITALS: VitalsState = {
  blood_pressure: "",
  heart_rate: "",
  temperature: "",
  respiratory_rate: "",
  oxygen_saturation: "",
  weight: "",
  height: "",
};

/** Build the numeric `Vitals` payload from the local string state. */
function buildVitals(state: VitalsState): Vitals | undefined {
  const v: Vitals = {};
  if (state.blood_pressure.trim()) v.blood_pressure = state.blood_pressure.trim();
  if (state.heart_rate.trim()) v.heart_rate = Number(state.heart_rate);
  if (state.temperature.trim()) v.temperature = Number(state.temperature);
  if (state.respiratory_rate.trim())
    v.respiratory_rate = Number(state.respiratory_rate);
  if (state.oxygen_saturation.trim())
    v.oxygen_saturation = Number(state.oxygen_saturation);
  if (state.weight.trim()) v.weight = Number(state.weight);
  if (state.height.trim()) v.height = Number(state.height);
  return Object.keys(v).length > 0 ? v : undefined;
}

export function TriageForm({
  patientId,
  doctorId,
  appointmentId,
  onSaved,
}: TriageFormProps) {
  const [symptomInput, setSymptomInput] = useState("");
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [vitals, setVitals] = useState<VitalsState>(EMPTY_VITALS);
  const [notes, setNotes] = useState("");

  const createTriage = useCreateTriageNote();

  function addSymptom() {
    const trimmed = symptomInput.trim().replace(/،/g, ",").trim();
    if (!trimmed) return;
    // Allow comma-separated bulk entry.
    const parts = trimmed.split(",").map((s) => s.trim()).filter(Boolean);
    setSymptoms((prev) => {
      const next = [...prev];
      for (const p of parts) {
        if (!next.includes(p)) next.push(p);
      }
      return next;
    });
    setSymptomInput("");
  }

  function removeSymptom(value: string) {
    setSymptoms((prev) => prev.filter((s) => s !== value));
  }

  function resetForm() {
    setSymptomInput("");
    setSymptoms([]);
    setVitals(EMPTY_VITALS);
    setNotes("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!patientId || !doctorId || !appointmentId) {
      toast.error("اطلاعات ویزیت ناقص است.", {
        description: "بیمار، پزشک و نوبت باید مشخص باشند.",
      });
      return;
    }

    createTriage.mutate(
      {
        patient_id: patientId,
        doctor_id: doctorId,
        appointment_id: appointmentId,
        symptoms,
        vitals: buildVitals(vitals),
        notes: notes.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("یادداشت تریاژ ثبت شد");
          resetForm();
          onSaved?.();
        },
        onError: (err: unknown) => {
          toast.error("ثبت یادداشت تریاژ ناموفق بود.", {
            description: (err as Error)?.message,
          });
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">یادداشت تریاژ</CardTitle>
        <CardDescription>
          علائم، علائم حیاتی و توضیحات اولیهٔ بیمار را ثبت کنید.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Symptoms */}
          <div className="space-y-2">
            <Label htmlFor="triage-symptom">علائم</Label>
            <div className="flex gap-2">
              <Input
                id="triage-symptom"
                value={symptomInput}
                onChange={(e) => setSymptomInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    addSymptom();
                  }
                }}
                placeholder="مثلاً: تب، سردرد، سرفه"
              />
              <Button type="button" variant="secondary" onClick={addSymptom}>
                افزودن
              </Button>
            </div>
            {symptoms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {symptoms.map((s) => (
                  <Badge key={s} variant="secondary" className="gap-1">
                    {s}
                    <button
                      type="button"
                      onClick={() => removeSymptom(s)}
                      aria-label={`حذف ${s}`}
                      className="hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Vitals */}
          <div className="space-y-2">
            <Label>علائم حیاتی</Label>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="v-bp" className="text-xs text-muted-foreground">
                  فشار خون
                </Label>
                <Input
                  id="v-bp"
                  inputMode="text"
                  placeholder="120/80"
                  value={vitals.blood_pressure}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, blood_pressure: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-hr" className="text-xs text-muted-foreground">
                  ضربان قلب
                </Label>
                <Input
                  id="v-hr"
                  type="number"
                  inputMode="numeric"
                  placeholder="۷۲"
                  value={vitals.heart_rate}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, heart_rate: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-temp" className="text-xs text-muted-foreground">
                  دما (°C)
                </Label>
                <Input
                  id="v-temp"
                  type="number"
                  step="0.1"
                  inputMode="decimal"
                  placeholder="۳۷"
                  value={vitals.temperature}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, temperature: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-rr" className="text-xs text-muted-foreground">
                  تعداد تنفس
                </Label>
                <Input
                  id="v-rr"
                  type="number"
                  inputMode="numeric"
                  placeholder="۱۸"
                  value={vitals.respiratory_rate}
                  onChange={(e) =>
                    setVitals((v) => ({
                      ...v,
                      respiratory_rate: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-spo2" className="text-xs text-muted-foreground">
                  اشباع اکسیژن (٪)
                </Label>
                <Input
                  id="v-spo2"
                  type="number"
                  inputMode="numeric"
                  placeholder="۹۸"
                  value={vitals.oxygen_saturation}
                  onChange={(e) =>
                    setVitals((v) => ({
                      ...v,
                      oxygen_saturation: e.target.value,
                    }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-w" className="text-xs text-muted-foreground">
                  وزن (kg)
                </Label>
                <Input
                  id="v-w"
                  type="number"
                  inputMode="numeric"
                  placeholder="۷۰"
                  value={vitals.weight}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, weight: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="v-h" className="text-xs text-muted-foreground">
                  قد (cm)
                </Label>
                <Input
                  id="v-h"
                  type="number"
                  inputMode="numeric"
                  placeholder="۱۷۵"
                  value={vitals.height}
                  onChange={(e) =>
                    setVitals((v) => ({ ...v, height: e.target.value }))
                  }
                />
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="triage-notes">یادداشت‌های تریاژ</Label>
            <textarea
              id="triage-notes"
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[96px] w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              placeholder="توضیحات تکمیلی تریاژ..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={createTriage.isPending}>
              {createTriage.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {createTriage.isPending ? "در حال ثبت..." : "ثبت تریاژ"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
