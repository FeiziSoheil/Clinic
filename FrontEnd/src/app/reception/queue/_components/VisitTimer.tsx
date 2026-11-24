"use client";

/**
 * Live elapsed-visit timer.
 *
 * Rendered next to an `IN_PROGRESS` appointment badge to show how long the
 * current visit has been running. It counts up once per second from the
 * backend-provided `visit_started_at` ISO timestamp, formats the result as
 * `MM:SS` (or `HH:MM:SS` once the visit exceeds one hour), and displays it
 * in Persian digits alongside a pulsing clock icon.
 *
 * The interval is cleaned up on unmount/`startedAt` change to avoid leaks.
 *
 * @param startedAt ISO 8601 timestamp marking when the visit was started.
 */

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import { cn } from "@/lib/utils";

/** Map of Western digits → Persian digits. */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Replace every Latin digit in `input` with its Persian counterpart. */
function toPersianDigits(input: string): string {
  return input.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/**
 * Format an elapsed duration (ms) as a readable clock string.
 *
 * - `< 1h` → `MM:SS` (zero-padded minutes & seconds).
 * - `≥ 1h` → `HH:MM:SS`.
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  const formatted =
    hours > 0 ? `${String(hours).padStart(2, "0")}:${mm}:${ss}` : `${mm}:${ss}`;

  return toPersianDigits(formatted);
}

export function VisitTimer({
  startedAt,
  className,
}: {
  startedAt: string;
  className?: string;
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = new Date(startedAt).getTime();

    // Guard against an invalid timestamp — never start the interval.
    if (Number.isNaN(startMs)) {
      setElapsed(0);
      return;
    }

    const update = () => setElapsed(Date.now() - startMs);
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 font-mono text-xs font-medium text-blue-700 tabular-nums dark:bg-blue-900/50 dark:text-blue-200",
        className,
      )}
    >
      <Clock className="size-3 animate-pulse" aria-hidden />
      <span dir="ltr">{formatDuration(elapsed)}</span>
    </span>
  );
}

export default VisitTimer;
