"use client";

/**
 * Reschedule dialog.
 *
 * Lets a patient move an existing (PENDING/CONFIRMED) appointment to a new date
 * and time slot. Mirrors the dialog/form patterns from
 * [`BookingDialog.tsx`](src/app/(patient)/doctors/[id]/BookingDialog.tsx):
 *
 *   1. `useDoctorShifts` → derive the upcoming bookable dates.
 *   2. `useTimeSlots`    → fetch the available slots for the chosen date.
 *   3. `useRescheduleAppointment` → submit the new date/time to the backend.
 *
 * On success the appointments cache is invalidated by the mutation hook so any
 * open list refetches automatically.
 */

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarClock, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDoctorShifts, useTimeSlots } from "@/hooks/useDoctors";
import { useRescheduleAppointment } from "@/hooks/useBooking";
import { formatJalaliLabel } from "@/lib/jalali";
import { cn } from "@/lib/utils";

/** Minimal appointment shape this dialog needs from the parent list. */
export interface ReschedulableAppointment {
  id: string;
  doctorName: string;
  doctorId: string;
  specialty: string;
  visitDurationMinutes: number;
}

export interface RescheduleDialogProps {
  appointment: ReschedulableAppointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RescheduleDialog({
  appointment,
  open,
  onOpenChange,
}: RescheduleDialogProps) {
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<{
    start_time: string;
    end_time: string;
  } | null>(null);

  const reschedule = useRescheduleAppointment();

  // 1. Fetch the doctor's upcoming shifts to populate the date select.
  const shiftsQuery = useDoctorShifts(appointment?.doctorId);

  /** Distinct, future bookable dates derived from the doctor's shifts. */
  const availableDates = useMemo(() => {
    if (!shiftsQuery.data) return [];
    const today = new Date().toISOString().slice(0, 10);
    const dates = Array.from(
      new Set(
        shiftsQuery.data
          .filter((s) => s.is_active && s.date >= today)
          .map((s) => s.date),
      ),
    );
    return dates.sort();
  }, [shiftsQuery.data]);

  // 2. Fetch bookable slots for the selected date.
  const slotsQuery = useTimeSlots(
    appointment?.doctorId,
    selectedDate || undefined,
    appointment?.visitDurationMinutes ?? 30,
  );

  /** Reset transient state whenever the dialog is reopened. */
  function handleOpenChange(next: boolean) {
    if (next) {
      setSelectedDate("");
      setSelectedSlot(null);
    }
    onOpenChange(next);
  }

  function handleDateChange(date: string) {
    setSelectedDate(date);
    setSelectedSlot(null);
  }

  async function handleConfirm() {
    if (!appointment || !selectedDate || !selectedSlot) return;

    try {
      await reschedule.mutateAsync({
        booking_id: appointment.id,
        new_date: selectedDate,
        new_start_time: selectedSlot.start_time,
        new_end_time: selectedSlot.end_time,
      });
      toast.success("نوبت با موفقیت تغییر کرد.");
      handleOpenChange(false);
    } catch (err) {
      toast.error("تغییر نوبت ممکن نشد.", {
        description: (err as Error)?.message,
      });
    }
  }

  const isPending = reschedule.isPending;
  const slots = slotsQuery.data ?? [];
  const freeSlots = slots.filter((s) => s.available);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="size-5 text-primary" />
            تغییر نوبت
          </DialogTitle>
          <DialogDescription>
            تاریخ و ساعت جدید را برای این نوبت انتخاب کنید.
          </DialogDescription>
        </DialogHeader>

        {/* Current appointment summary */}
        {appointment && (
          <div className="space-y-1.5 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">پزشک</span>
              <span className="font-medium">{appointment.doctorName}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">تخصص</span>
              <Badge variant="secondary">{appointment.specialty}</Badge>
            </div>
          </div>
        )}

        {/* Date select */}
        <div className="space-y-2">
          <Label htmlFor="reschedule-date">تاریخ جدید</Label>
          {shiftsQuery.isLoading ? (
            <Skeleton className="h-9 w-full" />
          ) : (
            <Select
              value={selectedDate}
              onValueChange={handleDateChange}
              disabled={isPending}
            >
              <SelectTrigger id="reschedule-date" className="w-full">
                <SelectValue placeholder="انتخاب تاریخ" />
              </SelectTrigger>
              <SelectContent>
                {availableDates.map((date) => (
                  <SelectItem key={date} value={date}>
                    {formatJalaliLabel(date, "full")}
                  </SelectItem>
                ))}
                {availableDates.length === 0 && (
                  <SelectItem value="_none" disabled>
                    تاریخ فعالی موجود نیست
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Time slots */}
        {selectedDate && (
          <div className="space-y-2">
            <Label>ساعت</Label>
            {slotsQuery.isLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : freeSlots.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                برای این تاریخ ساعت خالی وجود ندارد.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {freeSlots.map((slot) => {
                  const active =
                    selectedSlot?.start_time === slot.start_time;
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
                      disabled={isPending}
                      className={cn(
                        "rounded-md border px-2 py-1.5 text-sm transition-colors",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:bg-muted",
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

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
