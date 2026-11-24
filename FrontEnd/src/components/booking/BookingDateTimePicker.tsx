"use client";

/**
 * ============================================================================
 * CLINICK — BOOKING DATE/TIME PICKER (spec §4 of flow / §D)
 * ============================================================================
 * Composes the Jalali date picker with the time-slot grid, bound to the
 * booking draft. Selecting a date fetches that day's slots; selecting a slot
 * stores `{ startTime, endTime }` (end derived from `visit_duration_minutes`).
 * Changing the date clears the chosen time so the draft never holds a
 * stale (date, time) pair.
 * ============================================================================
 */

import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { TimeSlotGrid } from "./TimeSlotGrid";
import { useTimeSlots } from "@/hooks/useDoctors";
import { useBookingSession } from "@/hooks/useBookingSession";
import { todayIso, formatJalali } from "@/lib/jalali";

export function BookingDateTimePicker({
  doctorId,
  visitDurationMinutes,
}: {
  doctorId: string;
  visitDurationMinutes: number;
}) {
  const { draft, patchDraft } = useBookingSession();
  const date = draft?.date;
  const selectedTime = draft?.startTime;

  const slotsQuery = useTimeSlots(doctorId, date, visitDurationMinutes);

  const handleSelectDate = (iso: string) => {
    // New date → drop any previously-chosen time (it belongs to another day).
    patchDraft({ date: iso, startTime: "", endTime: "" });
  };

  const handleSelectSlot = (slot: { start_time: string; end_time: string }) => {
    patchDraft({
      startTime: slot.start_time,
      endTime: slot.end_time,
      step: "summary",
    });
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="booking-date" className="text-sm font-semibold">
          تاریخ ویزیت
        </label>
        <JalaliDatePicker
          id="booking-date"
          value={date}
          onChange={handleSelectDate}
          minDate={todayIso()}
          placeholder="انتخاب تاریخ (جلالی)"
        />
        {date ? (
          <p className="text-meta text-muted-foreground">
            {formatJalali(date)}
          </p>
        ) : null}
      </div>

      {date ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-semibold">ساعت خالی</span>
          <TimeSlotGrid
            slots={slotsQuery.data ?? []}
            loading={slotsQuery.isLoading}
            selected={selectedTime}
            onSelect={handleSelectSlot}
          />
        </div>
      ) : null}
    </div>
  );
}
