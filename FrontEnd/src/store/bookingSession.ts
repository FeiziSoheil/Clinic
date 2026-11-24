"use client";

/**
 * ============================================================================
 * CLINICK — BOOKING DRAFT STORE (spec §B.1)
 * ============================================================================
 * Persisted client-side booking draft — the selection a patient builds BEFORE
 * authenticating. Mirrors the zustand + persist pattern of
 * [`authStore`](src/store/authStore.ts) (key `booking-draft`) so the draft
 * survives reloads, back-navigation and the OTP redirect.
 *
 * The store only holds client selection state; it never calls the backend.
 * Committing the draft to a real appointment happens in
 * `useResumeAfterLogin` after OTP success.
 * ============================================================================
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import type { BookingDraft, BookingStep } from "@/lib/booking-session";

/**
 * Zustand's default `createJSONStorage(() => window.localStorage)` throws on
 * SSR, which makes `createJSONStorage` return `undefined` and the persist
 * middleware skip attaching `api.persist` entirely. A noop storage keeps the
 * persist API available during SSR; the real localStorage is used in the browser.
 */
const bookingDraftStorage = createJSONStorage(() =>
  typeof window !== "undefined"
    ? localStorage
    : {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {},
      },
);

interface BookingSessionState {
  /** The current draft, or `null` when the patient has no in-progress booking. */
  draft: BookingDraft | null;
  /** Replace the entire draft (and stamp `createdAt` if missing). */
  setDraft: (draft: BookingDraft) => void;
  /** Merge a partial update into the current draft (creates one if needed). */
  patchDraft: (patch: Partial<BookingDraft>) => void;
  /** Set only the current journey step. */
  setStep: (step: BookingStep) => void;
  /** Clear the draft entirely (on success, cancel, or explicit discard). */
  clearDraft: () => void;
}

/**
 * Resolve the persisted draft, dropping it if it has expired past the TTL.
 * Stale drafts are silently evicted on rehydration so the "resume booking"
 * pill never offers a dead session.
 */
function hydrate(stored: unknown): BookingDraft | null {
  if (!stored || typeof stored !== "object") return null;
  const draft = stored as BookingDraft;
  const TTL = 24 * 60 * 60 * 1000;
  if (!draft.createdAt || Date.now() - draft.createdAt > TTL) return null;
  return draft;
}

export const useBookingSessionStore = create<BookingSessionState>()(
  persist(
    (set) => ({
      draft: null,
      setDraft: (draft) =>
        set({
          draft: { ...draft, createdAt: draft.createdAt ?? Date.now() },
        }),
      patchDraft: (patch) =>
        set((state) => {
          const base = state.draft;
          const next: BookingDraft = {
            doctorId: patch.doctorId ?? base?.doctorId ?? "",
            date: patch.date ?? base?.date ?? "",
            startTime: patch.startTime ?? base?.startTime ?? "",
            endTime: patch.endTime ?? base?.endTime ?? "",
            createdAt: base?.createdAt ?? Date.now(),
            step: patch.step ?? base?.step ?? "search",
            branchId: patch.branchId ?? base?.branchId,
            serviceId: patch.serviceId ?? base?.serviceId,
            insuranceId: patch.insuranceId ?? base?.insuranceId,
            couponCode: patch.couponCode ?? base?.couponCode,
            referralCode: patch.referralCode ?? base?.referralCode,
            notes: patch.notes ?? base?.notes,
          };
          return { draft: next };
        }),
      setStep: (step) =>
        set((state) => {
          if (!state.draft || state.draft.step === step) return state;
          return { draft: { ...state.draft, step } };
        }),
      clearDraft: () => set({ draft: null }),
    }),
    {
      name: "booking-draft",
      storage: bookingDraftStorage,
      // Only the draft itself is persisted (actions are recreated at runtime).
      partialize: (state) => ({ draft: state.draft }) as BookingSessionState,
      // Evict expired drafts immediately on load.
      merge: (_persisted, current) => {
        const state = current as BookingSessionState;
        const persisted = _persisted as
          | { draft?: BookingDraft | null }
          | undefined;
        const draft = persisted ? hydrate(persisted.draft) : null;
        return { ...state, draft };
      },
    },
  ),
);
