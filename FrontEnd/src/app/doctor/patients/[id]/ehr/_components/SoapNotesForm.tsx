"use client";

/**
 * SoapNotesForm — structured SOAP note entry (Subjective / Objective /
 * Assessment / Plan) for an appointment, submitted via
 * {@link useCreateMedicalRecord}.
 *
 * An optional "تکمیل ویزیت پس از ذخیره" checkbox (default checked) sets the
 * `complete_visit` flag so the linked visit is marked COMPLETED atomically.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useCreateMedicalRecord } from "@/hooks/useEhr";

export interface SoapNotesFormProps {
  patientId: string;
  doctorId: string;
  appointmentId: string;
  onComplete?: () => void;
  /** When set (and token changes), replaces the Subjective field with this draft. */
  draftSubjective?: string;
  draftToken?: number;
}

interface SoapState {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

const EMPTY_SOAP: SoapState = {
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
};

const SECTIONS: { key: keyof SoapState; letter: string; label: string; placeholder: string }[] = [
  {
    key: "subjective",
    letter: "S",
    label: "ذهنی (Subjective)",
    placeholder: "شکایت بیمار، شرح حال و علائم...",
  },
  {
    key: "objective",
    letter: "O",
    label: "عینی (Objective)",
    placeholder: "یافته‌های معاینه فیزیکی و علائم حیاتی...",
  },
  {
    key: "assessment",
    letter: "A",
    label: "ارزیابی (Assessment)",
    placeholder: "تشخیص و برداشت بالینی...",
  },
  {
    key: "plan",
    letter: "P",
    label: "طرح درمان (Plan)",
    placeholder: "برنامهٔ درمان، داروها و پیگیری...",
  },
];

function SoapField({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <textarea
      className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[140px] w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SoapNotesForm({
  patientId,
  doctorId,
  appointmentId,
  onComplete,
  draftSubjective,
  draftToken = 0,
}: SoapNotesFormProps) {
  const [soap, setSoap] = useState<SoapState>(EMPTY_SOAP);
  const [completeVisit, setCompleteVisit] = useState(true);

  const createRecord = useCreateMedicalRecord();

  useEffect(() => {
    if (!draftToken || draftSubjective === undefined) return;
    setSoap((prev) => ({ ...prev, subjective: draftSubjective }));
  }, [draftToken, draftSubjective]);

  function update(key: keyof SoapState, value: string) {
    setSoap((prev) => ({ ...prev, [key]: value }));
  }

  function resetForm() {
    setSoap(EMPTY_SOAP);
    setCompleteVisit(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!patientId || !doctorId || !appointmentId) {
      toast.error("اطلاعات ویزیت ناقص است.", {
        description: "بیمار، پزشک و نوبت باید مشخص باشند.",
      });
      return;
    }

    createRecord.mutate(
      {
        patient_id: patientId,
        doctor_id: doctorId,
        appointment_id: appointmentId,
        subjective: soap.subjective.trim() || undefined,
        objective: soap.objective.trim() || undefined,
        assessment: soap.assessment.trim() || undefined,
        plan: soap.plan.trim() || undefined,
        complete_visit: completeVisit,
      },
      {
        onSuccess: () => {
          if (completeVisit) {
            toast.success("یادداشت SOAP ثبت شد", {
              description: "ویزیت تکمیل شد.",
            });
          } else {
            toast.success("یادداشت SOAP ثبت شد");
          }
          resetForm();
          onComplete?.();
        },
        onError: (err: unknown) => {
          toast.error("ثبت یادداشت SOAP ناموفق بود.", {
            description: (err as Error)?.message,
          });
        },
      },
    );
  }

  const isPending = createRecord.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">یادداشت SOAP</CardTitle>
        <CardDescription>
          شرح ساختاریافتهٔ ویزیت را در چهار بخش ثبت کنید.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Tabs defaultValue="subjective">
            <TabsList className="w-full">
              {SECTIONS.map((s) => (
                <TabsTrigger key={s.key} value={s.key}>
                  <span className="font-bold">{s.letter}</span>
                  <span className="hidden sm:inline">— {s.label.split(" ")[0]}</span>
                </TabsTrigger>
              ))}
            </TabsList>

            {SECTIONS.map((s) => (
              <TabsContent key={s.key} value={s.key} className="pt-3">
                <div className="space-y-2">
                  <Label htmlFor={`soap-${s.key}`}>{s.label}</Label>
                  <SoapField
                    value={soap[s.key]}
                    onChange={(v) => update(s.key, v)}
                    placeholder={s.placeholder}
                  />
                </div>
              </TabsContent>
            ))}
          </Tabs>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={completeVisit}
              onChange={(e) => setCompleteVisit(e.target.checked)}
              className="size-4 accent-primary"
            />
            تکمیل ویزیت پس از ذخیره
          </label>

          <div className="flex justify-end">
            <Button type="submit" disabled={isPending}>
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {isPending ? "در حال ثبت..." : "ثبت یادداشت"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
