"use client";

/**
 * Reception-side reschedule dialog.
 *
 * Lets the receptionist move *any* existing appointment to a new date and time
 * slot. Mirrors the patient-facing
 * [`RescheduleDialog`](src/app/(patient)/appointments/_components/RescheduleDialog.tsx)
 * visually, but is driven by explicit `doctorId` / `appointmentId` props
 * instead of a bundled appointment object, and uses a `JalaliDatePicker`
 * (rather than a shift-derived date select) so the receptionist can pick any
 * date.
 *
 * Flow:
 *   1. `JalaliDatePicker` → choose a date.
 *   2. `useTimeSlots`      → fetch the available slots for that date.
 *   3. `useRescheduleAppointment` → submit the new date/time.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useRescheduleAppointment } from "@/hooks/useBooking";
import { useTimeSlots } from "@/hooks/useDoctors";
import { formatJalali } from "@/lib/jalali";
import { cn } from "@/lib/utils";

export interface ReceptionRescheduleFormProps {
  appointmentId: string;
  patientName?: string;
  doctorId: string;
  onDone: () => void;
  onCancel: () => void;
}

export function ReceptionRescheduleForm({
  appointmentId,
  patientName: _patientName,
  doctorId,
  onDone,
  onCancel,
}: ReceptionRescheduleFormProps) {
  void _patientName;
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<{
    start_time: string;
    end_time: string;
  } | null>(null);

  const reschedule = useRescheduleAppointment();

  // Fetch bookable slots for the selected date (15-minute slots).
  const slotsQuery = useTimeSlots(doctorId, selectedDate || undefined, 15);

  function handleDateChange(iso: string) {
    setSelectedDate(iso);
    setSelectedSlot(null);
  }

  async function handleConfirm() {
    if (!appointmentId || !selectedDate || !selectedSlot) return;

    try {
      await reschedule.mutateAsync({
        booking_id: appointmentId,
        new_date: selectedDate,
        new_start_time: selectedSlot.start_time,
        new_end_time: selectedSlot.end_time,
      });
      toast.success("نوبت با موفقیت تغییر کرد.");
      onDone();
    } catch (err) {
      toast.error("تغییر نوبت ممکن نشد.", {
        description: (err as Error)?.message,
      });
    }
  }

  const isPending = reschedule.isPending;
  const slots = slotsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
{/* Date picker */}
        <div className="space-y-2">
          <Label htmlFor="reception-reschedule-date">تاریخ جدید</Label>
          <JalaliDatePicker
            id="reception-reschedule-date"
            value={selectedDate}
            onChange={(iso) => handleDateChange(iso)}
            placeholder="انتخاب تاریخ"
            disabled={isPending}
            className="w-full"
          />
        </div>

        {/* Time slots */}
        {selectedDate && (
          <div className="space-y-2">
            <Label>
              ساعت{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({formatJalali(selectedDate)})
              </span>
            </Label>
            {slotsQuery.isLoading ? (
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                برای این تاریخ ساعت خالی وجود ندارد.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {slots.map((slot) => {
                  const active = selectedSlot?.start_time === slot.start_time;
                  return (
                    <button
                      key={slot.start_time}
                      type="button"
                      onClick={() =>
                        setSelectedSlot({
                          start_time: slot.start_time,
                          end_time: slot.end_time,
                        })
                      }
                      disabled={isPending || !slot.available}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-sm transition-colors",
                        !slot.available &&
                          "cursor-not-allowed bg-muted text-muted-foreground opacity-60",
                        active &&
                          slot.available &&
                          "border-primary bg-primary text-primary-foreground",
                        !active &&
                          slot.available &&
                          "hover:bg-muted",
                      )}
                    >
                      {slot.start_time}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            انصراف
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isPending || !selectedDate || !selectedSlot}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال پردازش...
              </>
            ) : (
              "تأیید تغییر نوبت"
            )}
          </Button>
        </div>
    </div>
  );
}

/** @deprecated Use ReceptionRescheduleForm */
export const ReceptionRescheduleDialog = ReceptionRescheduleForm;

