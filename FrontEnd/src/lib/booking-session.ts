/**
 * ============================================================================
 * CLINICK — BOOKING DRAFT TYPES + HELPERS (spec §B.1)
 * ============================================================================
 * Server-safe types & validation for the client-side "Booking Draft" — the
 * persisted selection a patient builds BEFORE authentication.
 *
 * Why this exists: `BookAppointmentRequest` requires `patient_id`, so the
 * "book before auth" experience is realized as a client draft that is
 * *committed* to the backend only after a successful OTP (see
 * `useResumeAfterLogin`). The draft is persisted (zustand + localStorage) so
 * it survives reloads, back-navigation and the redirect to `/login`.
 *
 * Dates are stored as ISO `"YYYY-MM-DD"` (Gregorian) even though they render
 * Jalali; times are `"HH:mm"`.
 * ============================================================================
 */

/** Canonical steps of the booking journey (mirrors the §11 timeline). */
export type BookingStep =
  | "search"
  | "doctor"
  | "datetime"
  | "summary"
  | "auth"
  | "pay"
  | "done";

/** localStorage key shared by the draft store (mirrors `auth-storage`). */
export const BOOKING_DRAFT_STORAGE_KEY = "booking-draft";

/** sessionStorage key for the post-auth resume target. */
export const BOOKING_RESUME_TO_KEY = "booking-resume-to";

/** A draft older than this (ms) is treated as expired and discarded. */
export const BOOKING_DRAFT_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * The full client-side booking selection. Only `doctorId`, `date`,
 * `startTime`, `endTime` map onto {@link BookAppointmentRequest}; the rest
 * drive UI / future backend fields (insurance, coupon, referral, notes).
 */
export interface BookingDraft {
  /** Doctor profile id (patient-facing), see {@link Doctor.id}. */
  doctorId: string;
  branchId?: string;
  serviceId?: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  /** Slot start, `"HH:mm"`. */
  startTime: string;
  /** Slot end, `"HH:mm"` (derived from `visit_duration_minutes`). */
  endTime: string;
  insuranceId?: string;
  couponCode?: string;
  referralCode?: string;
  notes?: string;
  /** Epoch ms — used to expire stale drafts (TTL {@link BOOKING_DRAFT_TTL_MS}). */
  createdAt: number;
  /** Current step, drives the {@link BookingStepper}. */
  step: BookingStep;
}

/**
 * Minimum selection required before the draft can be committed to a booking.
 * Without these we cannot build a valid {@link BookAppointmentRequest}.
 */
export type BookingDraftCore = Pick<
  BookingDraft,
  "doctorId" | "date" | "startTime" | "endTime"
>;

/** True when the draft carries the minimum data to create an appointment. */
export function isDraftComplete(draft: BookingDraft | null): draft is BookingDraft {
  return (
    !!draft &&
    Boolean(draft.doctorId) &&
    Boolean(draft.date) &&
    Boolean(draft.startTime) &&
    Boolean(draft.endTime)
  );
}

/** True when the draft is still within its validity window (not expired). */
export function isDraftFresh(draft: BookingDraft | null): boolean {
  if (!draft) return false;
  return Date.now() - draft.createdAt <= BOOKING_DRAFT_TTL_MS;
}

/** True when a draft is both complete AND non-expired — i.e. resumable. */
export function isDraftResumable(draft: BookingDraft | null): boolean {
  return isDraftComplete(draft) && isDraftFresh(draft);
}
