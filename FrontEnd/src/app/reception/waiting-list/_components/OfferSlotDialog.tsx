"use client";

/**
 * Offer-slot dialog.
 *
 * Lets the receptionist offer a specific freed-up slot to a waiting-list
 * patient, converting the entry into a booking. Mirrors the slot-picker pattern
 * of the patient `RescheduleDialog`, but driven by `useOfferSlot`.
 *
 * Flow:
 *   1. `JalaliDatePicker` → choose a date.
 *   2. `useTimeSlots`      → fetch available slots for that date.
 *   3. `useOfferSlot`      → submit `{ entry_id, start_time, end_time }`.
 *
 * The doctor id (needed for slot fetching) is derived from the doctor schedule
 * response (`useDoctorSchedule`), matching the reception queue page's pattern.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useOfferSlot } from "@/hooks/useBooking";
import { useDoctorSchedule } from "@/hooks/useDoctorPortal";
import { useTimeSlots } from "@/hooks/useDoctors";
import { useAuthStore } from "@/store/authStore";
import { formatJalali } from "@/lib/jalali";
import { cn } from "@/lib/utils";

/** Today's date as `"YYYY-MM-DD"`. */
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface OfferSlotFormProps {
  entryId: string;
  patientName: string;
  onDone: () => void;
  onCancel: () => void;
}

export function OfferSlotForm({
  entryId,
  patientName: _patientName,
  onDone,
  onCancel,
}: OfferSlotFormProps) {
  void _patientName;
  const user = useAuthStore((s) => s.user);

  // Derive the doctor id from the doctor schedule response (same pattern as
  // the reception queue page), falling back to the signed-in user's id.
  const scheduleQuery = useDoctorSchedule(todayISO());
  const doctorId = scheduleQuery.data?.doctor_id ?? user?.id ?? "";

  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<{
    start_time: string;
    end_time: string;
  } | null>(null);

  const offerSlot = useOfferSlot();

  // Fetch bookable slots for the selected date (15-minute slots).
  const slotsQuery = useTimeSlots(doctorId, selectedDate || undefined, 15);

  function handleDateChange(iso: string) {
    setSelectedDate(iso);
    setSelectedSlot(null);
  }

  async function handleSubmit() {
    if (!entryId || !selectedSlot) return;

    try {
      await offerSlot.mutateAsync({
        entry_id: entryId,
        start_time: selectedSlot.start_time,
        end_time: selectedSlot.end_time,
      });
      toast.success("نوبت با موفقیت ثبت شد.");
      onDone();
    } catch (err) {
      toast.error("ارائه نوبت ناموفق بود.", {
        description: (err as Error)?.message,
      });
    }
  }

  const isPending = offerSlot.isPending;
  const slots = slotsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-4">
{/* Date picker */}
        <div className="space-y-2">
          <Label htmlFor="offer-slot-date">تاریخ</Label>
          <JalaliDatePicker
            id="offer-slot-date"
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
            onClick={handleSubmit}
            disabled={isPending || !selectedSlot}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                در حال پردازش...
              </>
            ) : (
              "ثبت نوبت"
            )}
          </Button>
        </div>
    </div>
  );
}

/** @deprecated Use OfferSlotForm */
export const OfferSlotDialog = OfferSlotForm;

