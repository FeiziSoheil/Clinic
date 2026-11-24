"use client";

/**
 * Create Time Block form for the staff panel drawer.
 *
 * Lets a doctor block off a chunk of their own calendar (a meeting, lunch,
 * personal errand, …). Uses a lightweight local-state form (no react-hook-form)
 * since the field set is tiny.
 */

import { useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCreateTimeBlock } from "@/hooks/useDoctorShifts";
import { toast } from "sonner";

export interface TimeBlockFormProps {
  /** Hex id of the signed-in doctor. */
  doctorId: string;
  onDone: () => void;
  onCancel: () => void;
}

/** Predefined reasons offered in the reason dropdown. */
const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "meeting", label: "جلسه" },
  { value: "lunch", label: "ناهار" },
  { value: "personal", label: "امور شخصی" },
  { value: "other", label: "سایر" },
];

export function TimeBlockForm({
  doctorId,
  onDone,
  onCancel,
}: TimeBlockFormProps) {
  const createMutation = useCreateTimeBlock();

  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reasonPreset, setReasonPreset] = useState("meeting");
  const [customReason, setCustomReason] = useState("");

  const isPending = createMutation.isPending;

  const isCustom = reasonPreset === "other";
  const reasonLabel =
    REASON_OPTIONS.find((r) => r.value === reasonPreset)?.label ?? "سایر";
  const resolvedReason = isCustom
    ? customReason.trim() || "سایر"
    : reasonLabel;

  const isValid =
    Boolean(date) &&
    Boolean(startTime) &&
    Boolean(endTime) &&
    startTime < endTime;

  function handleSubmit() {
    if (!date) {
      toast.error("تاریخ الزامی است.");
      return;
    }
    if (!startTime || !endTime) {
      toast.error("ساعت شروع و پایان الزامی است.");
      return;
    }
    if (startTime >= endTime) {
      toast.error("ساعت پایان باید بعد از شروع باشد.");
      return;
    }
    createMutation.mutate(
      {
        doctor_id: doctorId,
        date,
        start_time: startTime,
        end_time: endTime,
        reason: resolvedReason,
      },
      {
        onSuccess: () => onDone(),
      },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-2">
        <Label>تاریخ</Label>
        <JalaliDatePicker value={date} onChange={setDate} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label>ساعت شروع</Label>
          <Input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label>ساعت پایان</Label>
          <Input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label>دلیل</Label>
        <Select value={reasonPreset} onValueChange={setReasonPreset}>
          <SelectTrigger>
            <SelectValue placeholder="انتخاب دلیل" />
          </SelectTrigger>
          <SelectContent>
            {REASON_OPTIONS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isCustom ? (
          <Input
            placeholder="دلیل دلخواه را وارد کنید"
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
          />
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          انصراف
        </Button>
        <Button
          type="button"
          onClick={handleSubmit}
          disabled={isPending || !isValid}
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          ذخیره
        </Button>
      </div>
    </div>
  );
}

/** @deprecated Use TimeBlockForm */
export const TimeBlockDialog = TimeBlockForm;
