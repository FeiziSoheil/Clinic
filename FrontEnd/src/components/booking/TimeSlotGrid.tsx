"use client";

/**
 * ============================================================================
 * CLINICK — TIME SLOT GRID (spec §6, §D)
 * ============================================================================
 * Renders the bookable time slots for a doctor on a date as a responsive grid
 * of selectable pills. Unavailable slots are visibly disabled but still shown
 * (so the patient understands capacity), and the currently-selected slot is
 * highlighted in brand. Fully keyboard-operable as a radiogroup.
 * ============================================================================
 */

import { Clock, Inbox } from "lucide-react";
import type { TimeSlot } from "@/types/doctor";
import { TRANSITION } from "@/lib/motion";
import { cn, toPersianDigits } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface TimeSlotGridProps {
  slots: TimeSlot[];
  selected?: string; // start_time of the selected slot
  onSelect: (slot: TimeSlot) => void;
  loading?: boolean;
  className?: string;
}

export function TimeSlotGrid({
  slots,
  selected,
  onSelect,
  loading,
  className,
}: TimeSlotGridProps) {
  if (loading) {
    return (
      <div
        className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", className)}
        aria-hidden="true"
      >
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-xl" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 py-10 text-center">
        <Inbox className="size-8 text-muted-foreground" aria-hidden="true" />
        <p className="font-semibold">نوبتی برای این روز موجود نیست</p>
        <p className="text-sm text-muted-foreground">
          اگر پزشک شیفت دارد ولی ساعتی نمی‌بینید، ممکن است همهٔ نوبت‌های امروز
          گذشته باشند — تاریخ دیگری را انتخاب کنید.
        </p>
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="انتخاب ساعت نوبت"
      className={cn("grid grid-cols-3 gap-2 sm:grid-cols-4", className)}
    >
      {slots.map((slot) => {
        const isSelected = selected === slot.start_time;
        return (
          <button
            key={slot.start_time}
            type="button"
            role="radio"
            aria-checked={isSelected}
            disabled={!slot.available}
            onClick={() => onSelect(slot)}
            className={cn(
              "flex h-11 items-center justify-center gap-1 rounded-xl border text-sm font-medium tabular-nums",
              TRANSITION.interactive,
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              !slot.available &&
                "cursor-not-allowed border-border bg-muted/50 text-muted-foreground/50 line-through",
              slot.available && !isSelected &&
                "border-border bg-card text-foreground hover:border-brand/50 hover:bg-brand-mint/30",
              isSelected &&
                "border-brand bg-brand text-brand-foreground shadow-soft",
            )}
          >
            <Clock className="size-3.5 opacity-70" aria-hidden="true" />
            {toPersianDigits(slot.start_time)}
          </button>
        );
      })}
    </div>
  );
}
