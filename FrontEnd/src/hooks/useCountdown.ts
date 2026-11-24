"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Simple countdown timer hook used by the OTP auth screens to drive their
 * "resend code" cooldown.
 *
 * Calling `start(seconds)` arms the countdown; `remaining` ticks down once per
 * second and reaches 0 when the cooldown is over. The hook clears its interval
 * on unmount so no stray timers leak.
 *
 * @returns `{ remaining, isRunning, start }`
 */
export function useCountdown() {
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (seconds: number) => {
      clear();
      const initial = Math.max(0, Math.floor(seconds));
      setRemaining(initial);
      if (initial <= 0) return;
      timerRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clear();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clear],
  );

  // Clean up the interval when the component unmounts.
  useEffect(() => clear, [clear]);

  return { remaining, isRunning: remaining > 0, start };
}
