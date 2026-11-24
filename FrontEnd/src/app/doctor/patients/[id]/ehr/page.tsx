"use client";

/**
 * Doctor — EHR (Electronic Health Record) page.
 *
 * Route: `/doctor/patients/[id]/ehr?appointment=<appointment_id>`.
 *
 * Organized into two tabs:
 *   1. «تریاژ و ثبت» — TriageDisplay/TriageForm + SoapNotesForm for the
 *      current appointment (the appointment id comes from the
 *      `?appointment=` search param), followed by an embedded
 *      {@link PrescriptionComposer} so the prescription flow sits inside the
 *      visit entry flow, directly under the SOAP notes. The composer keeps its
 *      own «اعلان به بیمار» checkbox + submit, and the SoapNotesForm keeps its
 *      «تکمیل ویزیت پس از ذخیره» toggle + submit, so the final action controls
 *      (notify / complete visit) naturally appear after the SOAP + prescription
 *      builder. When a triage note already exists it is shown read-only with an
 *      edit affordance; otherwise the entry form is rendered.
 *   2. «تاریخچه پزشکی» — full timeline of the patient's past SOAP/general
 *      records via {@link PastMedicalRecords}, followed by the patient's past
 *      prescriptions via {@link PrescriptionHistory}.
 */

import { useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useAuthStore } from "@/store/authStore";
import { TriageForm } from "./_components/TriageForm";
import { TriageDisplay } from "./_components/TriageDisplay";
import { SoapNotesForm } from "./_components/SoapNotesForm";
import { PreVisitReportPanel } from "./_components/PreVisitReportPanel";
import { PastMedicalRecords } from "./_components/PastMedicalRecords";
import { PrescriptionComposer } from "@/app/doctor/prescriptions/_components/PrescriptionComposer";
import { PrescriptionHistory } from "@/app/doctor/prescriptions/_components/PrescriptionHistory";

export default function EhrPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const patientId = String(params?.id ?? "");
  const appointmentId = searchParams.get("appointment") ?? "";
  const doctorId = useAuthStore((s) => s.user)?.id ?? "";

  // Whether the triage entry form is shown (vs the read-only display). Toggled
  // when no triage exists yet or the doctor chooses to edit/add.
  const [showTriageForm, setShowTriageForm] = useState(false);
  const [draftSubjective, setDraftSubjective] = useState("");
  const [draftToken, setDraftToken] = useState(0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="icon"
          onClick={() => router.push("/doctor/queue")}
          aria-label="بازگشت به برنامه"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">پروندهٔ بیمار</h1>
          <p className="text-sm text-muted-foreground">
            شناسهٔ بیمار: <span className="font-medium">{patientId}</span>
            {appointmentId ? (
              <>
                {" · "}نوبت:{" "}
                <span className="font-medium">{appointmentId}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {!appointmentId ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          برای ثبت تریاژ و یادداشت SOAP، باید از طریق یک نوبت وارد این صفحه
          شوید.
        </div>
      ) : null}

      <Tabs defaultValue="entry">
        <TabsList>
          <TabsTrigger value="entry">تریاژ و ثبت</TabsTrigger>
          <TabsTrigger value="history">تاریخچه پزشکی</TabsTrigger>
        </TabsList>

        {/* Tab 1: Triage + SOAP + embedded prescription composer */}
        <TabsContent value="entry" className="space-y-4 pt-4">
          {appointmentId ? (
            <Accordion type="single" defaultValue="previsit" className="rounded-lg border px-4">
              <AccordionItem value="previsit">
                <AccordionTrigger>گزارش پیش‌ویزیت AI</AccordionTrigger>
                <AccordionContent>
                  <PreVisitReportPanel
                    appointmentId={appointmentId}
                    currentSubjective={draftSubjective}
                    onApplyDraft={(text) => {
                      setDraftSubjective(text);
                      setDraftToken((n) => n + 1);
                    }}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* تریاژ */}
              <AccordionItem value="triage">
                <AccordionTrigger>تریاژ</AccordionTrigger>
                <AccordionContent>
                  {showTriageForm ? (
                    <TriageForm
                      patientId={patientId}
                      doctorId={doctorId}
                      appointmentId={appointmentId}
                      onSaved={() => setShowTriageForm(false)}
                    />
                  ) : (
                    <TriageDisplay
                      appointmentId={appointmentId}
                      onEdit={() => setShowTriageForm(true)}
                    />
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* یادداشت‌های SOAP */}
              <AccordionItem value="soap">
                <AccordionTrigger>یادداشت‌های SOAP</AccordionTrigger>
                <AccordionContent>
                  <SoapNotesForm
                    patientId={patientId}
                    doctorId={doctorId}
                    appointmentId={appointmentId}
                    draftSubjective={draftSubjective}
                    draftToken={draftToken}
                  />
                </AccordionContent>
              </AccordionItem>

              {/* صدور نسخه — composer embedded under the SOAP notes so the
                  prescription flow is part of the visit entry. The composer
                  carries its own «اعلان به بیمار» checkbox + submit, which
                  naturally places the notify action after the SOAP builder. */}
              <AccordionItem value="prescription">
                <AccordionTrigger>صدور نسخه</AccordionTrigger>
                <AccordionContent>
                  <PrescriptionComposer
                    patientId={patientId}
                    doctorId={doctorId}
                    appointmentId={appointmentId}
                  />
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          ) : (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              نوبتی برای ثبت اطلاعات انتخاب نشده است.
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Medical history + past prescriptions */}
        <TabsContent value="history" className="space-y-6 pt-4">
          <PastMedicalRecords patientId={patientId} />

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">نسخه‌های پیشین بیمار</h2>
            <Separator />
            {/* History scoped to this patient */}
            <PrescriptionHistory doctorId={doctorId} patientId={patientId} />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
