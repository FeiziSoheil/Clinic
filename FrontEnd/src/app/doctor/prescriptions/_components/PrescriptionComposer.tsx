"use client";

/**
 * PrescriptionComposer — dynamic multi-line prescription builder.
 *
 * For each drug line the doctor gets an instant, locally-indexed medicine search
 * via {@link MedicineSearchCombobox} (debounced 350ms, wired to
 * {@link useMedicineSearch}) plus controls for dose / frequency / duration / sig
 * / quantity. The favorites + recents quick-add rows sit above the lines for
 * one-click prescribing of common drugs. On submit a
 * {@link useCreatePrescription} mutation is fired (toast feedback lives in the
 * hook).
 *
 * State separation (spec §13):
 *  - **search state** lives inside {@link MedicineSearchCombobox};
 *  - **selected medicine** lives on the line as `medicine` (transient — not
 *    submitted);
 *  - **prescription form** fields (dose/frequency/duration/sig/quantity) live on
 *    the line and are submitted as-is.
 */

import { useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FavoriteMedicines } from "@/components/prescription/FavoriteMedicines";
import { MedicineDetailsPanel } from "@/components/prescription/MedicineDetailsPanel";
import { MedicineSearchCombobox } from "@/components/prescription/MedicineSearchCombobox";
import {
  RecentMedicines,
  pushRecentMedicine,
} from "@/components/prescription/RecentMedicines";
import { useCreatePrescription } from "@/hooks/usePrescriptions";
import type { CreatePrescriptionItemRequest } from "@/types/prescription";
import type { MedicineSearchResult } from "@/types/medicine";

export interface PrescriptionComposerProps {
  patientId: string;
  doctorId: string;
  appointmentId?: string;
}

/** Common Persian frequency options. */
const FREQUENCY_OPTIONS = [
  "روزانه یک بار",
  "روزانه دو بار",
  "روزانه سه بار",
  "هر ۸ ساعت",
  "هر ۱۲ ساعت",
  "قبل از خواب",
  "در صورت نیاز",
];

interface DrugLine extends CreatePrescriptionItemRequest {
  /** Transient selected medicine (drives the combobox value); not submitted. */
  medicine: MedicineSearchResult | null;
}

function emptyLine(): DrugLine {
  return {
    drug_name: "",
    rxcui: "",
    dose: "",
    frequency: "",
    duration: "",
    sig: "",
    quantity: "",
    medicine: null,
  };
}

/**
 * A single drug line: the medicine search combobox + dose/frequency/duration/
 * sig/quantity controls. The combobox owns its own search state; a selection
 * maps onto the line's `drug_name`/`rxcui` (and the transient `medicine`).
 */
function DrugLineRow({
  index,
  line,
  onChange,
  onRemove,
  canRemove,
}: {
  index: number;
  line: DrugLine;
  onChange: (next: DrugLine) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  function handleSelect(m: MedicineSearchResult) {
    pushRecentMedicine(m);
    onChange({
      ...line,
      medicine: m,
      drug_name: m.generic_name,
      rxcui: m.rxcui,
    });
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">
          داروی {index + 1}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 text-destructive"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label="حذف دارو"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Instant medicine search */}
      <div className="space-y-2">
        <Label htmlFor={`drug-${index}`}>نام دارو</Label>
        <MedicineSearchCombobox
          id={`drug-${index}`}
          value={line.medicine}
          onChange={handleSelect}
          placeholder="نام دارو را جستجو کنید..."
        />
        {/* Normalized clinical detail for the selected medicine. */}
        <MedicineDetailsPanel rxcui={line.rxcui || null} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor={`dose-${index}`}>دوز</Label>
          <Input
            id={`dose-${index}`}
            placeholder="مثلاً 500mg"
            value={line.dose}
            onChange={(e) => onChange({ ...line, dose: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`freq-${index}`}>دفعات مصرف</Label>
          <Select
            value={line.frequency}
            onValueChange={(v) => onChange({ ...line, frequency: v })}
          >
            <SelectTrigger id={`freq-${index}`} className="w-full">
              <SelectValue placeholder="انتخاب کنید" />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCY_OPTIONS.map((f) => (
                <SelectItem key={f} value={f}>
                  {f}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`dur-${index}`}>مدت درمان</Label>
          <Input
            id={`dur-${index}`}
            placeholder="مثلاً ۷ روز"
            value={line.duration}
            onChange={(e) => onChange({ ...line, duration: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`qty-${index}`}>تعداد (اختیاری)</Label>
          <Input
            id={`qty-${index}`}
            placeholder="مثلاً ۳۰ قرص"
            value={line.quantity ?? ""}
            onChange={(e) => onChange({ ...line, quantity: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor={`sig-${index}`}>دستور مصرف</Label>
        <textarea
          id={`sig-${index}`}
          className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[70px] w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
          placeholder="مثلاً بعد از غذا همراه با آب فراوان"
          value={line.sig}
          onChange={(e) => onChange({ ...line, sig: e.target.value })}
        />
      </div>
    </div>
  );
}

export function PrescriptionComposer({
  patientId,
  doctorId,
  appointmentId,
}: PrescriptionComposerProps) {
  const [lines, setLines] = useState<DrugLine[]>([emptyLine()]);
  const [notes, setNotes] = useState("");
  const [notifyPatient, setNotifyPatient] = useState(true);

  const createPrescription = useCreatePrescription();

  function updateLine(index: number, next: DrugLine) {
    setLines((prev) => prev.map((l, i) => (i === index ? next : l)));
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine()]);
  }

  function removeLine(index: number) {
    setLines((prev) => prev.filter((_, i) => i !== index));
  }

  /**
   * Quick-add a medicine (from favorites / recents) as a new line. Reuses the
   * trailing empty line when present so the list doesn't accumulate blanks.
   */
  function quickAddMedicine(m: MedicineSearchResult) {
    pushRecentMedicine(m);
    setLines((prev) => {
      const last = prev[prev.length - 1];
      const isBlank =
        last && last.drug_name.trim() === "" && !last.medicine;
      if (isBlank) {
        return prev.map((l, i) =>
          i === prev.length - 1
            ? {
                ...l,
                medicine: m,
                drug_name: m.generic_name,
                rxcui: m.rxcui,
              }
            : l,
        );
      }
      return [
        ...prev,
        {
          ...emptyLine(),
          medicine: m,
          drug_name: m.generic_name,
          rxcui: m.rxcui,
        },
      ];
    });
  }

  function resetForm() {
    setLines([emptyLine()]);
    setNotes("");
    setNotifyPatient(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!patientId || !doctorId) {
      return;
    }

    const items: CreatePrescriptionItemRequest[] = lines
      .filter((l) => l.drug_name.trim() !== "")
      .map((l) => ({
        drug_name: l.drug_name.trim(),
        rxcui: l.rxcui,
        dose: l.dose.trim(),
        frequency: l.frequency,
        duration: l.duration.trim(),
        sig: l.sig.trim(),
        quantity: l.quantity?.trim() || undefined,
      }));

    if (items.length === 0) {
      return;
    }

    createPrescription.mutate(
      {
        patient_id: patientId,
        appointment_id: appointmentId || undefined,
        items,
        notes: notes.trim() || undefined,
        notify_patient: notifyPatient,
      },
      {
        onSuccess: () => {
          resetForm();
        },
      },
    );
  }

  const isPending = createPrescription.isPending;
  const validLineCount = lines.filter((l) => l.drug_name.trim() !== "").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">صدور نسخهٔ جدید</CardTitle>
        <CardDescription>
          داروها را با جستجوی لحظه‌ای اضافه کنید و جزئیات مصرف را وارد نمایید.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Clinical shortcuts: favorites (backend) + recents (localStorage). */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <FavoriteMedicines onSelect={quickAddMedicine} />
            <RecentMedicines onSelect={quickAddMedicine} />
          </div>

          <div className="space-y-3">
            {lines.map((line, index) => (
              <DrugLineRow
                key={index}
                index={index}
                line={line}
                canRemove={lines.length > 1}
                onChange={(next) => updateLine(index, next)}
                onRemove={() => removeLine(index)}
              />
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={addLine}
            className="w-full"
          >
            <Plus className="size-4" />
            افزودن داروی دیگر
          </Button>

          <div className="space-y-2">
            <Label htmlFor="notes">یادداشت (اختیاری)</Label>
            <textarea
              id="notes"
              className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-[80px] w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
              placeholder="توضیحات بالینی اختیاری..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={notifyPatient}
              onChange={(e) => setNotifyPatient(e.target.checked)}
              className="size-4 accent-primary"
            />
            ارسال پیامک نسخه (شامل لینک دانلود) به بیمار
          </label>

          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={isPending || validLineCount === 0}
            >
              {isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              {isPending ? "در حال صدور..." : "صدور نسخه"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
