"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  buildJalaliMonthGrid,
  isoToJalali,
  JALALI_MONTHS,
  JALALI_WEEKDAYS,
  jalaliToIso,
  toPersianDigits,
  todayIso,
} from "@/lib/jalali";
import { cn } from "@/lib/utils";

export interface JalaliCalendarProps {
  /** Selected date as a Gregorian `"YYYY-MM-DD"` string, or empty. */
  value?: string;
  onChange: (isoDate: string) => void;
  /** Gregorian `"YYYY-MM-DD"` bounds (inclusive). */
  minDate?: string;
  maxDate?: string;
}

export function JalaliCalendar({
  value,
  onChange,
  minDate,
  maxDate,
}: JalaliCalendarProps) {
  const selected = value ? isoToJalali(value) : null;
  // Today's date as a local Gregorian `"YYYY-MM-DD"` string — used both to
  // highlight the current day in the grid and as the default calendar view.
  const today = todayIso();
  const [view, setView] = useState(() => {
    const base = selected ?? isoToJalali(today);
    return { jy: base.jy, jm: base.jm };
  });

  const cells = buildJalaliMonthGrid(view.jy, view.jm);

  function goToPrevMonth() {
    setView((v) =>
      v.jm === 1 ? { jy: v.jy - 1, jm: 12 } : { jy: v.jy, jm: v.jm - 1 },
    );
  }

  function goToNextMonth() {
    setView((v) =>
      v.jm === 12 ? { jy: v.jy + 1, jm: 1 } : { jy: v.jy, jm: v.jm + 1 },
    );
  }

  return (
    <div className="w-64 select-none" dir="rtl">
      <div className="mb-2 flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={goToNextMonth}
          aria-label="ماه بعد"
        >
          <ChevronRight className="size-4" />
        </Button>
        <span className="text-sm font-medium">
          {JALALI_MONTHS[view.jm - 1]} {toPersianDigits(view.jy)}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={goToPrevMonth}
          aria-label="ماه قبل"
        >
          <ChevronLeft className="size-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
        {JALALI_WEEKDAYS.map((w, i) => (
          <div key={i} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell) => {
          const isSelected = value === cell.iso;
          const isToday = today === cell.iso;
          const isDisabled =
            (minDate && cell.iso < minDate) || (maxDate && cell.iso > maxDate);
          return (
            <button
              key={cell.iso}
              type="button"
              disabled={Boolean(isDisabled)}
              onClick={() => onChange(cell.iso)}
              aria-current={isToday ? "date" : undefined}
              aria-pressed={isSelected}
              className={cn(
                "relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-sm transition-colors",
                cell.inCurrentMonth
                  ? "text-foreground"
                  : "text-muted-foreground/50",
                !isSelected && !isDisabled && "hover:bg-muted",
                isSelected && "bg-primary text-primary-foreground hover:bg-primary",
                isDisabled && "cursor-not-allowed opacity-30",
                // Today marker: a small dot under the number when not selected,
                // and a ring around the cell so today is always visible.
                isToday && !isSelected && "ring-1 ring-primary/60",
              )}
            >
              {toPersianDigits(cell.jd)}
              {isToday && !isSelected && (
                <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="mt-2 w-full"
        onClick={() => {
          const { jy, jm } = isoToJalali(today);
          setView({ jy, jm });
          onChange(today);
        }}
      >
        امروز
      </Button>
    </div>
  );
}

export { jalaliToIso };
