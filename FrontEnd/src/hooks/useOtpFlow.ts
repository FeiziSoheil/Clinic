"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { extractLockSeconds, otpErrorMessage, sendOtp } from "@/lib/auth";

/**
 * The OTP code-entry phase, driven entirely by the single countdown owned by
 * this hook. There is deliberately only ONE timer in the whole screen: it
 * represents both the code's remaining validity and (once the code expires)
 * the wait until a resend is possible. When the phone gets locked, the same
 * timer counts the lock window down.
 *
 *   counting  → code is valid, resend is hidden
 *   expired   → code no longer valid, the "resend" action is available
 *   locked    → resend quota exhausted, blocked until the lock window elapses
 */
export type OtpPhase = "counting" | "expired" | "locked";

export interface UseOtpFlowResult {
  /** Current phase of the OTP entry. */
  phase: OtpPhase;
  /** Seconds left in the current phase. */
  remaining: number;
  /** `mm:ss` formatted remaining time (stable width for monospace display). */
  formatted: string;
  /** Resends the user may still request before being locked out. */
  remainingResends: number;
  /** Configured resend quota. */
  maxResends: number;
  /** True while a send/resend request is in flight. */
  sending: boolean;
  /** Last user-facing error from a send/resend attempt. */
  error: string | null;
  /** Request the first code for a phone. Resolves `true` on success. */
  send: (phone: string) => Promise<boolean>;
  /** Request a new code for the phone passed to the last successful send. */
  resend: () => Promise<boolean>;
  /** Clear the last error. */
  clearError: () => void;
}

/** Format a number of seconds as a zero-padded `mm:ss` string. */
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60)
    .toString()
    .padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

/**
 * Owns the OTP send/resend lifecycle for an auth screen.
 *
 * The hook keeps a single interval. Every `start` first destroys the previous
 * interval (no overlap, no leak) and the effect returned on unmount clears any
 * running interval, so the timer never outlives the component.
 */
export function useOtpFlow(): UseOtpFlowResult {
  const [phase, setPhase] = useState<OtpPhase>("counting");
  const [remaining, setRemaining] = useState(0);
  const [remainingResends, setRemainingResends] = useState(0);
  const [maxResends, setMaxResends] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneRef = useRef<string>("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  /**
   * Arm the single countdown: destroy any previous interval, seed `remaining`,
   * then tick once per second. When the counter reaches zero it clears itself
   * and invokes `onComplete` (which decides the next phase).
   */
  const startTimer = useCallback(
    (seconds: number, onComplete: () => void) => {
      clearTimer();
      const initial = Math.max(0, Math.floor(seconds));
      setRemaining(initial);
      if (initial <= 0) {
        onComplete();
        return;
      }
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            clearTimer();
            onComplete();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    [clearTimer],
  );

  /** Shared send/resend implementation. Resolves `true` when a code was sent. */
  const issue = useCallback(
    async (phone: string): Promise<boolean> => {
      setSending(true);
      setError(null);
      try {
        const res = await sendOtp(phone);
        phoneRef.current = phone;
        setRemainingResends(res.remaining_resends ?? 0);
        setMaxResends(res.max_resends ?? 0);
        setPhase("counting");
        startTimer(res.expires_in || res.resend_in || 60, () =>
          setPhase("expired"),
        );
        return true;
      } catch (err) {
        const lockFor = extractLockSeconds(err);
        setError(
          otpErrorMessage(err, "ارسال کد ناموفق بود. دوباره تلاش کنید."),
        );
        // If the backend locked the phone, drive the lock countdown; otherwise
        // fall back to the expired (resend-available) phase so the user can
        // retry without a phantom timer.
        if (lockFor && lockFor > 0) {
          setPhase("locked");
          startTimer(lockFor, () => setPhase("expired"));
        } else {
          setPhase("expired");
        }
        return false;
      } finally {
        setSending(false);
      }
    },
    [startTimer],
  );

  const send = useCallback((phone: string) => issue(phone), [issue]);

  const resend = useCallback(() => {
    if (!phoneRef.current) return Promise.resolve(false);
    return issue(phoneRef.current);
  }, [issue]);

  const clearError = useCallback(() => setError(null), []);

  // Full cleanup on unmount — never leak an interval.
  useEffect(() => () => clearTimer(), [clearTimer]);

  return {
    phase,
    remaining,
    formatted: formatClock(remaining),
    remainingResends,
    maxResends,
    sending,
    error,
    send,
    resend,
    clearError,
  };
}
