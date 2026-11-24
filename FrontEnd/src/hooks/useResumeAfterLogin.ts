"use client";

/**
 * ============================================================================
 * CLINICK — BOOK DRAFT AFTER AUTH
 * ============================================================================
 * Creates the appointment from the persisted public booking draft once the
 * patient is authenticated. Payment is intentionally left to the checkout UI
 * (PaymentSimulatorDialog) so the patient sees the simulated gateway flow.
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { useAuthStore } from "@/store/authStore";
import { useBookingSessionStore } from "@/store/bookingSession";
import { useBookAppointment } from "@/hooks/useBooking";
import {
  BOOKING_RESUME_TO_KEY,
  isDraftResumable,
} from "@/lib/booking-session";
import { tehranWallClockToISO } from "@/lib/jalali";

export type BookDraftStatus =
  | "idle"
  | "booking"
  | "awaiting_payment"
  | "done"
  | "conflict"
  | "error";

export interface UseBookDraftAfterAuth {
  status: BookDraftStatus;
  errorMessage: string | null;
  /** Set after a successful book — feed this into PaymentSimulatorDialog. */
  appointmentId: string | null;
  /** Re-attempt booking after a conflict/error. */
  retryBook: () => void;
  /** Call after the payment simulator succeeds. */
  markPaid: () => void;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; debug?: unknown }
      | undefined;
    const debug = data?.debug;
    if (typeof debug === "string" && debug.trim()) return debug;
    const msg = data?.message;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

const CHECKOUT_PATH = "/appointments/checkout";

export function useBookDraftAfterAuth(
  /** Book once when auth + a resumable draft are ready. */
  autoBook = false,
): UseBookDraftAfterAuth {
  const user = useAuthStore((s) => s.user);
  const draft = useBookingSessionStore((s) => s.draft);
  const setStep = useBookingSessionStore((s) => s.setStep);
  const clearDraft = useBookingSessionStore((s) => s.clearDraft);

  const { mutateAsync: bookAsync } = useBookAppointment();
  const bookRef = useRef(bookAsync);
  bookRef.current = bookAsync;

  const [status, setStatus] = useState<BookDraftStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);

  const autoAttemptedRef = useRef(false);
  const inFlightRef = useRef(false);

  const book = useCallback(async () => {
    if (inFlightRef.current) return;

    const activeDraft = useBookingSessionStore.getState().draft;
    const active = isDraftResumable(activeDraft) ? activeDraft : null;
    const currentUser = useAuthStore.getState().user;
    if (!currentUser || !active) {
      setStatus("idle");
      return;
    }

    inFlightRef.current = true;
    setStatus("booking");
    setErrorMessage(null);

    try {
      // #region agent log
      fetch("http://127.0.0.1:7350/ingest/49e18683-794b-4d1f-bd78-3f9172ae7e49", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "287f0f",
        },
        body: JSON.stringify({
          sessionId: "287f0f",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "useResumeAfterLogin.ts:book",
          message: "book attempt",
          data: {
            patientId: currentUser.id,
            doctorId: active.doctorId,
            date: active.date,
            startTime: active.startTime,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      const created = await bookRef.current({
        doctor_id: active.doctorId,
        patient_id: currentUser.id,
        start_time: tehranWallClockToISO(active.date, active.startTime),
        end_time: tehranWallClockToISO(active.date, active.endTime),
      });

      // #region agent log
      fetch("http://127.0.0.1:7350/ingest/49e18683-794b-4d1f-bd78-3f9172ae7e49", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "287f0f",
        },
        body: JSON.stringify({
          sessionId: "287f0f",
          runId: "post-fix",
          hypothesisId: "A",
          location: "useResumeAfterLogin.ts:book:success",
          message: "book succeeded",
          data: { appointmentId: String(created.id) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion

      setAppointmentId(String(created.id));
      setStep("pay");
      setStatus("awaiting_payment");
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem(BOOKING_RESUME_TO_KEY);
      }
    } catch (bookErr) {
      // #region agent log
      const ax = bookErr as {
        response?: { status?: number; data?: { message?: string; debug?: string } };
      };
      fetch("http://127.0.0.1:7350/ingest/49e18683-794b-4d1f-bd78-3f9172ae7e49", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Debug-Session-Id": "287f0f",
        },
        body: JSON.stringify({
          sessionId: "287f0f",
          runId: "pre-fix",
          hypothesisId: "A",
          location: "useResumeAfterLogin.ts:book:error",
          message: "book failed",
          data: {
            status: ax?.response?.status ?? null,
            apiMessage: ax?.response?.data?.message ?? null,
            apiDebug: ax?.response?.data?.debug ?? null,
            patientId: currentUser.id,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      setStep("datetime");
      setStatus("conflict");
      setErrorMessage(
        apiErrorMessage(bookErr, "این نوبت دیگر در دسترس نیست."),
      );
    } finally {
      inFlightRef.current = false;
    }
  }, [setStep]);

  useEffect(() => {
    if (!autoBook && typeof window !== "undefined") {
      const resumeTo = window.sessionStorage.getItem(BOOKING_RESUME_TO_KEY);
      if (resumeTo !== CHECKOUT_PATH && resumeTo !== "/booking") return;
    } else if (!autoBook) {
      return;
    }

    if (!user || autoAttemptedRef.current) return;
    if (!isDraftResumable(draft)) return;

    autoAttemptedRef.current = true;
    void book();
  }, [autoBook, user, draft, book]);

  const retryBook = useCallback(() => {
    autoAttemptedRef.current = true;
    void book();
  }, [book]);

  const markPaid = useCallback(() => {
    clearDraft();
    setStatus("done");
  }, [clearDraft]);

  return {
    status,
    errorMessage,
    appointmentId,
    retryBook,
    markPaid,
  };
}

/** @deprecated Prefer {@link useBookDraftAfterAuth}; kept as an alias name. */
export const useResumeAfterLogin = useBookDraftAfterAuth;
