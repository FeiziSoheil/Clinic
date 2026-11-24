"use client";

/**
 * ============================================================================
 * CLINICK — BOOKING SESSION HOOK (spec §B)
 * ============================================================================
 * Convenience accessor around the persisted {@link useBookingSessionStore},
 * plus the auth gate that redirects an unauthenticated patient to OTP *only*
 * at the payment step — preserving the draft via the resume target.
 *
 * The "commit after login" logic lives in `useResumeAfterLogin`; this hook is
 * the read/update API used by booking screens.
 * ============================================================================
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { useBookingSessionStore } from "@/store/bookingSession";
import { useAuthStore } from "@/store/authStore";
import {
  BOOKING_RESUME_TO_KEY,
  isDraftResumable,
  type BookingDraft,
} from "@/lib/booking-session";

export function useBookingSession() {
  const router = useRouter();
  const draft = useBookingSessionStore((s) => s.draft);
  const setDraft = useBookingSessionStore((s) => s.setDraft);
  const patchDraft = useBookingSessionStore((s) => s.patchDraft);
  const setStep = useBookingSessionStore((s) => s.setStep);
  const clearDraft = useBookingSessionStore((s) => s.clearDraft);

  /** True when there is a complete, non-expired draft to offer "resume". */
  const resumable = isDraftResumable(draft);

  /**
   * Auth gate for the payment step. Unauthenticated patients are sent to OTP
   * with the draft preserved; authenticated patients are routed straight to
   * the patient-panel checkout.
   */
  const requireAuth = useCallback(
    (next = "/appointments/checkout"): string => {
      const user = useAuthStore.getState().user;
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(BOOKING_RESUME_TO_KEY, next);
      }
      if (user) {
        router.push(next);
        return next;
      }
      router.push(`/login?next=${encodeURIComponent(next)}`);
      return `/login?next=${encodeURIComponent(next)}`;
    },
    [router],
  );

  return {
    draft: draft as BookingDraft | null,
    resumable,
    setDraft,
    patchDraft,
    setStep,
    clearDraft,
    requireAuth,
  };
}
