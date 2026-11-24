"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { CalendarIcon } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { JalaliCalendar } from "@/components/ui/jalali-calendar";
import { formatJalali } from "@/lib/jalali";
import { cn } from "@/lib/utils";

export interface JalaliDatePickerProps {
  /** Selected date as a Gregorian `"YYYY-MM-DD"` string, or empty. */
  value?: string;
  onChange: (isoDate: string) => void;
  placeholder?: string;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
  name?: string;
}

/**
 * Persian (Jalali) calendar date picker. Value/onChange stay Gregorian
 * `"YYYY-MM-DD"`.
 *
 * The panel is `position: fixed` (anchored to the trigger) so it is not clipped
 * by ancestors with `overflow-hidden` (e.g. shadcn `Card`). Pointer events on
 * the panel are stopped from bubbling so parent dismiss layers / outside-click
 * handlers do not close it before a day click registers — including when used
 * inside dialogs.
 */
export function JalaliDatePicker({
  value,
  onChange,
  placeholder = "انتخاب تاریخ",
  minDate,
  maxDate,
  disabled,
  className,
  id,
  name,
}: JalaliDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const reactId = useId();

  useLayoutEffect(() => {
    if (!open || !containerRef.current) {
      setPanelPos(null);
      return;
    }

    function updatePosition() {
      const trigger = containerRef.current;
      const panel = panelRef.current;
      if (!trigger) return;

      const rect = trigger.getBoundingClientRect();
      const panelWidth = panel?.offsetWidth ?? 280;
      const panelHeight = panel?.offsetHeight ?? 320;
      const gap = 4;

      // Prefer opening below; flip above if not enough space.
      let top = rect.bottom + gap;
      if (top + panelHeight > window.innerHeight - 8) {
        top = Math.max(8, rect.top - gap - panelHeight);
      }

      // Prefer aligning to the inline-start (right in RTL) edge of the trigger.
      let left = rect.right - panelWidth;
      if (left < 8) left = 8;
      if (left + panelWidth > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - 8 - panelWidth);
      }

      setPanelPos({ top, left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Node;
      if (
        containerRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        id={id}
        name={name}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${reactId}-panel` : undefined}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full cursor-pointer justify-start gap-2 font-normal",
          !value && "text-muted-foreground",
        )}
      >
        <CalendarIcon className="size-4" />
        {value ? formatJalali(value) : placeholder}
      </button>

      {open && (
        <div
          ref={panelRef}
          id={`${reactId}-panel`}
          role="dialog"
          aria-modal="false"
          dir="rtl"
          className="fixed z-50 rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
          style={
            panelPos
              ? { top: panelPos.top, left: panelPos.left }
              : { top: -9999, left: -9999, visibility: "hidden" as const }
          }
          onPointerDownCapture={(e) => e.stopPropagation()}
        >
          <JalaliCalendar
            value={value}
            minDate={minDate}
            maxDate={maxDate}
            onChange={(iso) => {
              onChange(iso);
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
