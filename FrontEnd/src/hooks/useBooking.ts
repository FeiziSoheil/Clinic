/**
 * React Query mutations & queries for the booking flow.
 *
 * Mutations invalidate the affected appointment lists on success so any open
 * lists refetch automatically. Callers get `mutate`, `isPending`,
 * `isSuccess`, `error`, etc. straight from the hook.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  bookAppointment,
  cancelAppointment,
  callPatient,
  checkInAppointment,
  completeVisit,
  confirmAppointment,
  convertWaitingEntry,
  getDailyTimeline,
  getMonthlyAppointments,
  getMyAppointments,
  getMyDailyTimeline,
  getMyMonthlyAppointments,
  getMyMonthlyAppointmentsByRange,
  getWaitingList,
  joinWaitingList,
  markNoShow,
  offerSlot,
  payVisitFee,
  rescheduleAppointment,
  startVisit,
  updateWaitingPriority,
} from "@/lib/booking-api";
import { doctorPortalKeys } from "@/hooks/useDoctorPortal";
import { doctorKeys } from "@/hooks/useDoctors";
import type {
  BookAppointmentRequest,
  CancelAppointmentRequest,
  CompleteVisitRequest,
  JoinWaitingListRequest,
  MarkNoShowRequest,
  OfferSlotRequest,
  PayVisitFeeRequest,
  RescheduleAppointmentRequest,
  StartVisitRequest,
  UpdateWaitingPriorityRequest,
} from "@/types/booking";

/**
 * Namespaced query-key factory for appointment-related queries.
 *
 * `all` invalidates everything booking-related, `appointments` scopes to the
 * appointment list, and `waitingList` scopes the cache to a specific
 * (doctor, date) tuple.
 */
export const bookingKeys = {
  all: ["bookings"] as const,
  appointments: ["bookings", "appointments"] as const,
  waitingList: (doctorId: string, date: string) =>
    ["bookings", "waiting-list", doctorId, date] as const,
  monthly: (doctorId: string, year: number, month: number) =>
    ["bookings", "monthly", doctorId, year, month] as const,
  myMonthly: (year: number, month: number) =>
    ["bookings", "my-monthly", year, month] as const,
  myMonthlyRange: (from: string, to: string) =>
    ["bookings", "my-monthly-range", from, to] as const,
  timeline: (doctorId: string, date: string) =>
    ["bookings", "timeline", doctorId, date] as const,
  myTimeline: (date: string) => ["bookings", "my-timeline", date] as const,
};

/** Create a new appointment (then pay the visit fee as a follow-up step). */
export function useBookAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: BookAppointmentRequest) => bookAppointment(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      // Refetch the doctor's slot grid so a slot that was just booked no
      // longer appears as available (the booking is strictly one-per-slot).
      void queryClient.invalidateQueries({ queryKey: doctorKeys.all });
    },
  });
}

/**
 * Pay the full visit fee for an appointment in one up-front payment.
 *
 * Throws on insufficient balance — callers should catch the error and
 * redirect to the wallet top-up flow.
 */
export function usePayVisitFee() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: PayVisitFeeRequest) => payVisitFee(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/**
 * Cancel an existing appointment.
 *
 * Surfaces backend errors (e.g. 403 within 3h of the visit) to the caller via
 * the `error` field.
 */
export function useCancelAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CancelAppointmentRequest) => cancelAppointment(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/**
 * Reschedule an existing appointment to a new date/time.
 *
 * Invalidates the appointment list on success so updated slots refetch.
 */
export function useRescheduleAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: RescheduleAppointmentRequest) => rescheduleAppointment(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.appointments });
    },
  });
}

/**
 * Add a patient to a doctor's waiting list for a given date.
 *
 * Invalidates the matching (doctor, date) waiting-list cache on success.
 */
export function useJoinWaitingList() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: JoinWaitingListRequest) => joinWaitingList(req),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({
        queryKey: bookingKeys.waitingList(data.doctor_id, data.date),
      });
    },
  });
}

/**
 * Fetch a doctor's waiting list for a given date.
 *
 * The query is enabled only when both `doctorId` and `date` are provided.
 */
export function useWaitingList(doctorId: string | undefined, date: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.waitingList(doctorId ?? "", date ?? ""),
    queryFn: () => {
      // `enabled` guarantees both are present at call time.
      return getWaitingList(doctorId as string, date as string);
    },
    enabled: Boolean(doctorId && date),
  });
}

/**
 * Fetch the signed-in patient's full appointment history (active + past) from
 * the real backend (`GET /v1/bookings/me/appointments`).
 *
 * Cancel/reschedule/check-in/convert mutations all invalidate the booking
 * cache, so the list refetches automatically after any change.
 */
export function useMyAppointments() {
  return useQuery({
    queryKey: bookingKeys.appointments,
    queryFn: () => getMyAppointments(),
  });
}

/**
 * Check-in an appointment at the reception desk (CONFIRMED → CHECKED_IN).
 *
 * Invalidates both the doctor-portal schedule cache and the appointments list.
 * Toasts are handled by the calling page.
 */
export function useCheckIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => checkInAppointment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.appointments });
    },
  });
}

/**
 * Confirm a pending appointment (PENDING → CONFIRMED + SMS).
 */
export function useConfirmAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => confirmAppointment(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
    },
  });
}

/**
 * Call / admit a checked-in patient (CHECKED_IN → CALLED).
 */
export function useCallPatient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => callPatient(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
      void queryClient.invalidateQueries({ queryKey: bookingKeys.appointments });
    },
  });
}

/**
 * Convert a waiting-list entry into a confirmed booking.
 *
 * Invalidates both the booking cache (so the waiting list refreshes) and the
 * doctor-portal schedule cache (so the new appointment appears in the queue).
 * Toasts are handled by the calling page.
 */
export function useConvertWaitingEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (entryId: string) => convertWaitingEntry(entryId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
    },
  });
}

/**
 * Start a visit (CALLED → IN_PROGRESS).
 *
 * Invalidates both the booking cache and the doctor-portal schedule cache so
 * the queue reflects the new status. Toasts are handled by the calling page.
 */
export function useStartVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: StartVisitRequest) => startVisit(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
    },
  });
}

/**
 * Complete a visit (in-progress → completed).
 *
 * Invalidates both the booking cache and the doctor-portal schedule cache so
 * the queue reflects the new status. Toasts are handled by the calling page.
 */
export function useCompleteVisit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CompleteVisitRequest) => completeVisit(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
    },
  });
}

/**
 * Mark an appointment as a no-show.
 *
 * Invalidates the booking cache, the doctor-portal schedule cache, and the
 * waiting list (so any freed slot logic stays consistent). Toasts are handled
 * by the calling page.
 */
export function useMarkNoShow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: MarkNoShowRequest) => markNoShow(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["bookings", "waiting-list"] });
    },
  });
}

/**
 * Offer a specific slot to a waiting-list entry, converting it into a booking.
 *
 * Invalidates the booking cache and the doctor-portal schedule cache so the
 * new appointment shows up in the queue and the waiting list refreshes.
 * Toasts are handled by the calling page.
 */
export function useOfferSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: OfferSlotRequest) => offerSlot(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
    },
  });
}

/**
 * Update the priority of a waiting-list entry.
 *
 * Invalidates the waiting-list cache for the affected (doctor, date) tuple.
 * Because the request only carries the entry id, the entire `waiting-list`
 * namespace is invalidated to cover the current doctor/date context. Toasts
 * are handled by the calling page.
 */
export function useUpdateWaitingPriority() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: UpdateWaitingPriorityRequest) => updateWaitingPriority(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["bookings", "waiting-list"] });
    },
  });
}

/**
 * Fetch per-day appointment summary counts for a month (calendar view).
 *
 * Real endpoint: `GET /v1/bookings/monthly/:doctorID/:year/:month`. The query
 * is enabled only when `doctorId` is provided.
 */
export function useMonthlyAppointments(
  doctorId: string | undefined,
  year: number,
  month: number,
) {
  return useQuery({
    queryKey: bookingKeys.monthly(doctorId ?? "", year, month),
    queryFn: () => {
      // `enabled` guarantees a doctorId at call time.
      return getMonthlyAppointments(doctorId as string, year, month);
    },
    enabled: Boolean(doctorId),
  });
}

/**
 * Fetch per-day appointment summary counts for the signed-in user's doctor
 * ("me") for a month (calendar view).
 *
 * Unlike {@link useMonthlyAppointments} this needs no doctor id: the backend
 * resolves the doctor from the JWT (a receptionist is mapped to their employer
 * doctor). The query is enabled only when both `year` and `month` are truthy.
 *
 * Real endpoint: `GET /v1/bookings/me/monthly/:year/:month`.
 */
export function useMyMonthlyAppointments(year: number, month: number) {
  return useQuery({
    queryKey: bookingKeys.myMonthly(year, month),
    queryFn: () => getMyMonthlyAppointments(year, month),
    enabled: !!year && !!month,
  });
}

/**
 * Fetch the signed-in doctor/receptionist's per-day appointment breakdown over
 * an explicit Gregorian date range. Used by the reception Jalali calendar
 * (whose months span two Gregorian months). Enabled only when both `from` and
 * `to` are provided (inclusive `"YYYY-MM-DD"`).
 *
 * Real endpoint: `GET /v1/bookings/me/monthly?from=&to=`.
 */
export function useMyMonthlyAppointmentsByRange(
  from: string | undefined,
  to: string | undefined,
) {
  return useQuery({
    queryKey: bookingKeys.myMonthlyRange(from ?? "", to ?? ""),
    queryFn: () => getMyMonthlyAppointmentsByRange(from!, to!),
    enabled: !!from && !!to,
  });
}

/**
 * Fetch a doctor's daily timeline (shifts + appointments) for a given date.
 *
 * Real endpoint: `GET /v1/bookings/timeline/:doctorID/:date`. The query is
 * enabled only when both `doctorId` and `date` are provided.
 */
export function useDailyTimeline(
  doctorId: string | undefined,
  date: string | undefined,
) {
  return useQuery({
    queryKey: bookingKeys.timeline(doctorId ?? "", date ?? ""),
    queryFn: () => {
      // `enabled` guarantees both are present at call time.
      return getDailyTimeline(doctorId as string, date as string);
    },
    enabled: Boolean(doctorId && date),
  });
}

/**
 * Fetch the signed-in user's daily timeline via the server-side "me" endpoint.
 *
 * Unlike {@link useDailyTimeline} this needs no doctor id: the backend resolves
 * the doctor from the JWT (a receptionist is mapped to their employer doctor),
 * which is the correct source of truth and avoids the stale/empty doctor_id
 * that the `/doctors/me/schedule` response does not return.
 *
 * @param date `"YYYY-MM-DD"`; query is disabled until a value is supplied.
 */
export function useMyDailyTimeline(date: string | undefined) {
  return useQuery({
    queryKey: bookingKeys.myTimeline(date ?? ""),
    queryFn: () => getMyDailyTimeline(date as string),
    enabled: Boolean(date),
  });
}
