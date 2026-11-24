"use client";

/**
 * ============================================================================
 * CLINICK — BOOKING STEPPER (spec §D, §11)
 * ============================================================================
 * The journey indicator for the booking flow. Reflects the current
 * {@link BookingStep} stored in the booking draft, marking completed, current
 * and upcoming steps. Purely presentational + accessible as an ordered list;
 * clicking a completed step is optional (passed via `onStepClick`).
 *
 * On wide screens it renders horizontally; on mobile it collapses to a compact
 * "۲ از ۶ · انتخاب زمان" summary to save space.
 * ============================================================================
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/utils";
import type { BookingStep } from "@/lib/booking-session";

export interface BookingStepperProps {
  current: BookingStep;
  /** Optional navigation handler; when omitted, steps are non-interactive. */
  onStepClick?: (step: BookingStep) => void;
  className?: string;
}

interface StepDef {
  key: BookingStep;
  label: string;
}

// Ordered journey (mirrors the §11 timeline; OTP & pay are marked visually).
const STEPS: StepDef[] = [
  { key: "search", label: "جستجو" },
  { key: "doctor", label: "انتخاب پزشک" },
  { key: "datetime", label: "تاریخ و ساعت" },
  { key: "summary", label: "مرور خلاصه" },
  { key: "auth", label: "ورود" },
  { key: "pay", label: "پرداخت" },
  { key: "done", label: "تأیید نوبت" },
];

export function BookingStepper({ current, onStepClick, className }: BookingStepperProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);
  const currentDef = STEPS[currentIndex];

  return (
    <>
      {/* Desktop / tablet: full horizontal stepper */}
      <ol
        className={cn(
          "hidden items-center gap-1 sm:flex",
          className,
        )}
        aria-label="مراحل رزرو"
      >
        {STEPS.map((step, i) => {
          const state =
            i < currentIndex ? "done" : i === currentIndex ? "current" : "upcoming";
          const interactive = !!onStepClick && state !== "upcoming";
          return (
            <li key={step.key} className="flex flex-1 items-center gap-1">
              <button
                type="button"
                disabled={!interactive}
                onClick={() => interactive && onStepClick?.(step.key)}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "group flex flex-1 items-center gap-2 rounded-xl px-2.5 py-2 text-start transition-colors",
                  interactive && "cursor-pointer hover:bg-muted",
                  !interactive && "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums ring-1 transition-colors",
                    state === "done" &&
                      "bg-brand text-brand-foreground ring-brand",
                    state === "current" &&
                      "bg-brand-mint/70 text-brand ring-brand",
                    state === "upcoming" &&
                      "bg-card text-muted-foreground ring-border",
                  )}
                >
                  {state === "done" ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    toPersianDigits(String(i + 1))
                  )}
                </span>
                <span
                  className={cn(
                    "text-sm font-medium",
                    state === "upcoming" ? "text-muted-foreground" : "text-foreground",
                  )}
                >
                  {step.label}
                </span>
              </button>
              {i < STEPS.length - 1 ? (
                <span
                  className={cn(
                    "h-px flex-1 transition-colors",
                    i < currentIndex ? "bg-brand/60" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* Mobile: compact progress summary */}
      <p
        className="flex items-center gap-2 px-1 text-sm sm:hidden"
        aria-label={`مرحله ${toPersianDigits(String(currentIndex + 1))} از ${toPersianDigits(String(STEPS.length))}: ${currentDef?.label ?? ""}`}
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-brand text-xs font-semibold text-brand-foreground tabular-nums">
          {toPersianDigits(String(currentIndex + 1))}
        </span>
        <span className="font-medium">{currentDef?.label}</span>
        <span className="text-muted-foreground">
          ({toPersianDigits(String(currentIndex + 1))} از{" "}
          {toPersianDigits(String(STEPS.length))})
        </span>
      </p>
    </>
  );
}
