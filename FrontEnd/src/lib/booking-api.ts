/**
 * Booking & finance write operations.
 *
 * Both endpoints below already exist on the backend, so these calls hit the
 * real API by default. A {@link USE_MOCK} flag is provided for offline
 * development / end-to-end demos where you don't want to create real
 * appointments.
 */

import { apiClient } from "./api";
import type {
  Appointment,
  AppointmentStatus,
  BookAppointmentRequest,
  CancelAppointmentRequest,
  CompleteVisitRequest,
  DailyTimelineResponse,
  Invoice,
  JoinWaitingListRequest,
  MarkNoShowRequest,
  MonthlyAppointmentSummary,
  OfferSlotRequest,
  PayVisitFeeRequest,
  PaymentStatus,
  PaymentType,
  RescheduleAppointmentRequest,
  StartVisitRequest,
  UpdateWaitingPriorityRequest,
  WaitingListEntry,
  WaitingListResponse,
} from "@/types/booking";

/**
 * Master switch for the booking mock layer. Keep `false` in normal operation
 * so real appointments are created / the visit fee is charged in full.
 */
export const USE_MOCK = false;

/**
 * A denormalized appointment row for the patient "my appointments" list.
 *
 * Mirrors the backend `PatientAppointmentResponse` DTO. The doctor id here is
 * the patient-facing PROFILE id (not the underlying user id appointments are
 * stored under), which is what the booking/reschedule flows key on.
 */
export interface AppointmentListItem {
  id: string;
  doctorName: string;
  /** Doctor profile id — needed to fetch shifts/slots for reschedule. */
  doctorId: string;
  specialty: string;
  /** Visit length in minutes — needed for slot generation on reschedule. */
  visitDurationMinutes: number;
  /** Total visit fee in Toman — used to compute the cancellation penalty. */
  fee: number;
  /** ISO datetime string for display formatting + cancellation-tier math. */
  date: string;
  startTime: string;
  endTime: string;
  status: AppointmentStatus;
  paymentStatus: PaymentStatus;
  /** Payment channel — online wallet vs in-clinic. */
  paymentType?: PaymentType;
}

/** Raw snake_case shape returned by `GET /v1/bookings/me/appointments`. */
interface PatientAppointmentResponseRaw {
  id: string;
  doctor_id: string;
  doctor_name: string;
  specialty: string;
  visit_duration_minutes: number;
  fee: number;
  date: string;
  start_time: string;
  end_time: string;
  status: AppointmentStatus;
  payment_status: PaymentStatus;
  payment_type?: PaymentType;
}

function mapPatientAppointment(
  row: PatientAppointmentResponseRaw,
): AppointmentListItem {
  return {
    id: row.id,
    doctorName: row.doctor_name,
    doctorId: row.doctor_id,
    specialty: row.specialty,
    visitDurationMinutes: row.visit_duration_minutes,
    fee: row.fee,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    status: row.status,
    paymentStatus: row.payment_status,
    paymentType: row.payment_type,
  };
}

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a new appointment.
 *
 * Real endpoint: `POST /v1/bookings/book`.
 */
export async function bookAppointment(
  req: BookAppointmentRequest,
): Promise<Appointment> {
  if (USE_MOCK) {
    await delay(500);
    return {
      id: `apt-${Math.random().toString(36).slice(2, 10)}`,
      patient_id: req.patient_id,
      doctor_id: req.doctor_id,
      // The request intentionally omits `date`; default to today for the mock.
      date: new Date().toISOString().slice(0, 10),
      start_time: req.start_time,
      end_time: req.end_time,
      status: "PENDING",
      payment_status: "UNPAID",
    };
  }

  const res = await apiClient.post<Appointment>("/v1/bookings/book", req);
  return res.data;
}

/**
 * Pay the FULL visit fee for an appointment in a single up-front payment.
 *
 * Real endpoint: `POST /v1/finance/pay` (the deposit/prepayment mechanism has
 * been removed — the entire fee is collected at once).
 *
 * --- How to simulate a wallet failure ---
 * The backend rejects the payment when the patient's wallet balance is below
 * the doctor's `visit_fee`. To exercise the "insufficient balance"
 * redirect-to-wallet path locally, you can either:
 *   1. Use a patient whose wallet has a near-zero balance, or
 *   2. Temporarily uncomment the deterministic-fail block below.
 *
 * Example deterministic fail (kept commented so default behavior is success):
 * ```
 * if (USE_MOCK && req.appointment_id.endsWith("0")) {
 *   await delay(400);
 *   throw new Error("Insufficient balance");
 * }
 * ```
 */
export async function payVisitFee(req: PayVisitFeeRequest): Promise<Invoice> {
  if (USE_MOCK) {
    await delay(600);
    // Default: always succeed. See the docblock above for how to simulate a
    // deterministic "Insufficient balance" failure for wallet-redirect flows.
    return {
      id: `inv-${Math.random().toString(36).slice(2, 10)}`,
      appointment_id: req.appointment_id,
      doctor_id: "",
      user_id: "",
      total_fee: 0,
      deposit_paid: 0,
      doctor_share: 0,
      status: "PARTIAL",
    };
  }

  const res = await apiClient.post<Invoice>("/v1/finance/pay", req);
  return res.data;
}

/**
 * Cancel an existing appointment.
 *
 * Real endpoint: `POST /v1/bookings/cancel`. Hits the real API (no mock
 * branch) since `USE_MOCK` only governs the book/pay flow.
 *
 * Errors: not found → 404, already cancelled / non-cancellable → 409,
 * within 3h of the visit → 403, invalid id → 400.
 */
export async function cancelAppointment(
  req: CancelAppointmentRequest,
): Promise<Appointment> {
  const res = await apiClient.post<Appointment>("/v1/bookings/cancel", req);
  return res.data;
}

/**
 * Reschedule an existing appointment to a new date/time.
 *
 * Real endpoint: `POST /v1/bookings/reschedule`.
 *
 * Errors: booking not found → 404, non-reschedulable status → 409,
 * slot conflict → 409, within 3h of the visit → 403.
 */
export async function rescheduleAppointment(
  req: RescheduleAppointmentRequest,
): Promise<Appointment> {
  if (USE_MOCK) {
    await delay(500);
    return {
      id: req.booking_id,
      patient_id: "",
      doctor_id: "",
      date: req.new_date,
      start_time: req.new_start_time,
      end_time: req.new_end_time,
      status: "CONFIRMED",
      payment_status: "PAID",
    };
  }

  const res = await apiClient.post<Appointment>(
    "/v1/bookings/reschedule",
    req,
  );
  return res.data;
}

/**
 * Add a patient to a doctor's waiting list for a given date.
 *
 * Real endpoint: `POST /v1/bookings/waiting-list`.
 */
export async function joinWaitingList(
  req: JoinWaitingListRequest,
): Promise<WaitingListEntry> {
  if (USE_MOCK) {
    await delay(500);
    return {
      id: `wl-${Math.random().toString(36).slice(2, 10)}`,
      doctor_id: req.doctor_id,
      patient_id: req.patient_id,
      patient_name: req.patient_name ?? "Patient",
      date: req.date,
      priority: req.priority ?? "NORMAL",
      entry_type: req.entry_type ?? "ONLINE",
      position: Math.floor(Math.random() * 5) + 1,
      status: "waiting",
      created_at: new Date().toISOString(),
      phone: req.phone,
    };
  }

  const res = await apiClient.post<WaitingListEntry>(
    "/v1/bookings/waiting-list",
    req,
  );
  return res.data;
}

/**
 * Fetch the signed-in patient's full appointment history (active + past),
 * denormalized with the doctor profile/name so the "my appointments" page can
 * render each row from a single request.
 *
 * Real endpoint: `GET /v1/bookings/me/appointments`.
 */
export async function getMyAppointments(): Promise<AppointmentListItem[]> {
  const res = await apiClient.get<PatientAppointmentResponseRaw[]>(
    "/v1/bookings/me/appointments",
  );
  return res.data.map(mapPatientAppointment);
}

/**
 * Check-in an appointment at the reception desk.
 *
 * Real endpoint: `POST /v1/bookings/check-in` with body `{ id }`.
 *
 * CONFIRMED → CHECKED_IN (patient arrived, waiting hall).
 *
 * Errors: appointment not found → 404, not checkable → 409.
 */
export async function checkInAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>("/v1/bookings/check-in", { id });
  return res.data;
}

/**
 * Confirm a pending appointment (reception).
 *
 * Real endpoint: `POST /v1/bookings/confirm` with body `{ id }`.
 *
 * PENDING → CONFIRMED + SMS to the patient.
 */
export async function confirmAppointment(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>("/v1/bookings/confirm", { id });
  return res.data;
}

/**
 * Call / admit a checked-in patient (reception).
 *
 * Real endpoint: `POST /v1/bookings/call` with body `{ id }`.
 *
 * CHECKED_IN → CALLED (patient's turn / entering the room).
 */
export async function callPatient(id: string): Promise<Appointment> {
  const res = await apiClient.post<Appointment>("/v1/bookings/call", { id });
  return res.data;
}

/**
 * Convert a waiting-list entry into a confirmed booking.
 *
 * Real endpoint: `POST /v1/bookings/waiting-list/:id/convert` (no body).
 *
 * Errors: entry not found → 404, already claimed / no slot → 409.
 */
export async function convertWaitingEntry(
  entryId: string,
): Promise<Appointment> {
  const res = await apiClient.post<Appointment>(
    `/v1/bookings/waiting-list/${entryId}/convert`,
  );
  return res.data;
}

/**
 * Fetch a doctor's waiting list for a given date.
 *
 * Real endpoint: `GET /v1/bookings/waiting-list/:doctor_id/:date`.
 */
export async function getWaitingList(
  doctorId: string,
  date: string,
): Promise<WaitingListResponse> {
  if (USE_MOCK) {
    await delay(500);
    return [
      {
        id: `wl-mock-1`,
        doctor_id: doctorId,
        patient_id: "pat-1",
        patient_name: "Sara Ahmadi",
        date,
        priority: "URGENT",
        entry_type: "ONLINE",
        position: 1,
        status: "waiting",
        created_at: new Date().toISOString(),
        phone: "09120000001",
      },
      {
        id: `wl-mock-2`,
        doctor_id: doctorId,
        patient_id: "pat-2",
        patient_name: "Reza Karimi",
        date,
        priority: "NORMAL",
        entry_type: "WALKIN",
        position: 2,
        status: "notified",
        created_at: new Date().toISOString(),
        phone: "09120000002",
      },
    ];
  }

  const res = await apiClient.get<WaitingListResponse>(
    `/v1/bookings/waiting-list/${doctorId}/${date}`,
  );
  return res.data;
}

/**
 * Start a visit — transitions a called appointment to `IN_PROGRESS`.
 *
 * Real endpoint: `POST /v1/bookings/start-visit` with body `{ id }`.
 */
export async function startVisit(req: StartVisitRequest): Promise<void> {
  await apiClient.post("/v1/bookings/start-visit", req);
}

/**
 * Complete a visit — transitions an in-progress appointment to `COMPLETED`.
 *
 * Real endpoint: `POST /v1/bookings/complete-visit` with body `{ id }`.
 */
export async function completeVisit(req: CompleteVisitRequest): Promise<void> {
  await apiClient.post("/v1/bookings/complete-visit", req);
}

/**
 * Mark an appointment as a no-show.
 *
 * Real endpoint: `POST /v1/bookings/no-show` with body `{ id }`.
 */
export async function markNoShow(req: MarkNoShowRequest): Promise<void> {
  await apiClient.post("/v1/bookings/no-show", req);
}

/**
 * Offer a specific slot to a waiting-list entry, converting it into a booking.
 *
 * Real endpoint: `POST /v1/bookings/waiting-list/:id/offer`.
 */
export async function offerSlot(req: OfferSlotRequest): Promise<Appointment> {
  const res = await apiClient.post<Appointment>(
    `/v1/bookings/waiting-list/${req.entry_id}/offer`,
    req,
  );
  return res.data;
}

/**
 * Update the priority of a waiting-list entry.
 *
 * Real endpoint: `PATCH /v1/bookings/waiting-list/:id/priority`.
 */
export async function updateWaitingPriority(
  req: UpdateWaitingPriorityRequest,
): Promise<void> {
  await apiClient.patch(`/v1/bookings/waiting-list/${req.id}/priority`, req);
}

/**
 * Fetch per-day appointment summary counts for a month (calendar view).
 *
 * Real endpoint: `GET /v1/bookings/monthly/:doctorID/:year/:month`.
 */
export async function getMonthlyAppointments(
  doctorId: string,
  year: number,
  month: number,
): Promise<MonthlyAppointmentSummary[]> {
  const res = await apiClient.get<MonthlyAppointmentSummary[]>(
    `/v1/bookings/monthly/${doctorId}/${year}/${month}`,
  );
  return res.data;
}

/**
 * Fetch per-day appointment summary counts for the signed-in user's doctor
 * ("me") for a month (calendar view).
 *
 * Server-side doctor resolution: the backend derives the doctor ("me") from the
 * JWT — a receptionist is transparently mapped to their employer doctor — so the
 * client never needs to know the doctor id.
 *
 * Real endpoint: `GET /v1/bookings/me/monthly/:year/:month`.
 */
export async function getMyMonthlyAppointments(
  year: number,
  month: number,
): Promise<MonthlyAppointmentSummary[]> {
  const { data } = await apiClient.get<MonthlyAppointmentSummary[]>(
    `/v1/bookings/me/monthly/${year}/${month}`,
  );
  return data;
}

/**
 * Fetch the signed-in doctor/receptionist's per-day appointment breakdown over
 * an explicit Gregorian date range.
 *
 * Real endpoint: `GET /v1/bookings/me/monthly?from=YYYY-MM-DD&to=YYYY-MM-DD`.
 *
 * Use this (not the year/month variant) for the reception Jalali calendar: a
 * Jalali month spans two Gregorian months, so the client supplies the exact
 * range computed from the displayed grid.
 */
export async function getMyMonthlyAppointmentsByRange(
  from: string,
  to: string,
): Promise<MonthlyAppointmentSummary[]> {
  const { data } = await apiClient.get<MonthlyAppointmentSummary[]>(
    "/v1/bookings/me/monthly",
    { params: { from, to } },
  );
  return data;
}

/**
 * Fetch a doctor's daily timeline (shifts + appointments) for a given date.
 *
 * Real endpoint: `GET /v1/bookings/timeline/:doctorID/:date`.
 */
export async function getDailyTimeline(
  doctorId: string,
  date: string,
): Promise<DailyTimelineResponse> {
  const res = await apiClient.get<DailyTimelineResponse>(
    `/v1/bookings/timeline/${doctorId}/${date}`,
  );
  return res.data;
}

/**
 * Fetch the signed-in user's daily timeline (shifts + appointments) for a
 * given date.
 *
 * Server-side doctor resolution: the backend derives the doctor ("me") from
 * the JWT — a receptionist is transparently mapped to their employer doctor —
 * so the client never needs to know the doctor id. This avoids the doctor_id
 * gap that left the reception timeline empty.
 *
 * Real endpoint: `GET /v1/doctors/me/timeline?date=YYYY-MM-DD`.
 */
export async function getMyDailyTimeline(
  date: string,
): Promise<DailyTimelineResponse> {
  const res = await apiClient.get<DailyTimelineResponse>(
    "/v1/doctors/me/timeline",
    { params: { date } },
  );
  return res.data;
}
