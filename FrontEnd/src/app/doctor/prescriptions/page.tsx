"use client";

/**
 * Doctor — Prescription Management page.
 *
 * Route: `/doctor/prescriptions?patient=<id>&appointment=<id>`.
 *
 * Reads optional `?patient=` and `?appointment=` search params to prefill the
 * compose form; when no patient is provided the doctor may pick one from today's
 * queue (via {@link useDoctorSchedule}) or enter an id manually. Organized into
 * two tabs: «صدور نسخه جدید» (compose) and «نسخه‌های صادر شده» (history).
 */

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { useDoctorSchedule } from "@/hooks/useDoctorPortal";
import { useAuthStore } from "@/store/authStore";
import { todayIso } from "@/lib/jalali";
import { PrescriptionComposer } from "./_components/PrescriptionComposer";
import { PrescriptionHistory } from "./_components/PrescriptionHistory";

export default function PrescriptionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const doctorId = useAuthStore((s) => s.user)?.id ?? "";

  const initialPatient = searchParams.get("patient") ?? "";
  const appointmentId = searchParams.get("appointment") ?? "";

  const [patientId, setPatientId] = useState(initialPatient);

  // Today's queue is used to offer a quick patient picker when none is prefilled.
  const scheduleQuery = useDoctorSchedule(todayIso());
  const queuePatients = useMemo(() => {
    const items = scheduleQuery.data?.items ?? [];
    // De-duplicate by patient_id while preserving order.
    const seen = new Set<string>();
    return items.filter((it) => {
      if (seen.has(it.patient_id)) return false;
      seen.add(it.patient_id);
      return true;
    });
  }, [scheduleQuery.data?.items]);

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
          <h1 className="text-2xl font-bold">مدیریت نسخه‌ها</h1>
          <p className="text-sm text-muted-foreground">
            صدور نسخهٔ جدید و مشاهدهٔ نسخه‌های صادرشده.
          </p>
        </div>
      </div>

      {/* Patient selector */}
      <div className="space-y-2 rounded-md border p-4">
        <Label htmlFor="patient-select">بیمار</Label>
        {queuePatients.length > 0 ? (
          <Select value={patientId} onValueChange={setPatientId}>
            <SelectTrigger id="patient-select" className="w-full">
              <SelectValue placeholder="انتخاب بیمار از صف امروز" />
            </SelectTrigger>
            <SelectContent>
              {queuePatients.map((p) => (
                <SelectItem key={p.patient_id} value={p.patient_id}>
                  {p.patient_name}{" "}
                  <span className="text-muted-foreground">— {p.patient_id}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <>
            <Input
              id="patient-select"
              placeholder="شناسهٔ بیمار (hex)"
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              شناسهٔ بیمار را وارد کنید یا از طریق صف بیماران وارد این صفحه شوید.
            </p>
          </>
        )}
      </div>

      <Tabs defaultValue="compose">
        <TabsList>
          <TabsTrigger value="compose">صدور نسخه جدید</TabsTrigger>
          <TabsTrigger value="history">نسخه‌های صادر شده</TabsTrigger>
        </TabsList>

        {/* Tab 1: Compose */}
        <TabsContent value="compose" className="pt-4">
          {patientId ? (
            <PrescriptionComposer
              patientId={patientId}
              doctorId={doctorId}
              appointmentId={appointmentId}
            />
          ) : (
            <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
              ابتدا یک بیمار انتخاب کنید.
            </div>
          )}
        </TabsContent>

        {/* Tab 2: History */}
        <TabsContent value="history" className="pt-4">
          <PrescriptionHistory doctorId={doctorId} patientId={patientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
