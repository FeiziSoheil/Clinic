/**
 * Booking & finance-domain types.
 *
 * `bookAppointment` and `payVisitFee` hit real backend endpoints that already
 * exist. The shapes below mirror the Go DTOs so the frontend types line up
 * with what the API returns.
 */

/** Lifecycle of an appointment. */
export type AppointmentStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CHECKED_IN"
  | "CALLED"
  | "IN_PROGRESS"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

/** Waiting-list priority level. */
export type WaitingPriority = "NORMAL" | "URGENT";

/** How a waiting-list entry originated. */
export type WaitingEntryType = "ONLINE" | "WALKIN" | "PHONE";

/** Payment state of an appointment. */
export type PaymentStatus = "UNPAID" | "PAID" | "REFUNDED";

/** How the visit fee was (or will be) collected. */
export type PaymentType = "ONLINE" | "IN_PERSON";

/** A single appointment record. */
export interface Appointment {
  id: string;
  patient_id: string;
  doctor_id: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  /** `"HH:mm"`. */
  start_time: string;
  /** `"HH:mm"`. */
  end_time: string;
  status: AppointmentStatus;
  payment_status: PaymentStatus;
  /** Payment channel — online wallet vs in-clinic (omitempty on legacy rows). */
  payment_type?: PaymentType;
  /** Patient display name (denormalized by the backend, `omitempty`). */
  patient_name?: string;
  /** Patient phone number (denormalized by the backend, `omitempty`). */
  patient_phone?: string;
}

/** Request body for `POST /v1/bookings/book`. */
export interface BookAppointmentRequest {
  doctor_id: string;
  patient_id: string;
  start_time: string;
  end_time: string;
}

/** Request body for `POST /v1/finance/pay` (full visit-fee payment). */
export interface PayVisitFeeRequest {
  appointment_id: string;
}

/** Request body for `POST /v1/bookings/cancel`. */
export interface CancelAppointmentRequest {
  id: string;
  reason?: string;
}

/** Request body for `POST /v1/bookings/reschedule`. */
export interface RescheduleAppointmentRequest {
  booking_id: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  new_date: string;
  /** `"HH:mm"`. */
  new_start_time: string;
  /** `"HH:mm"`. */
  new_end_time: string;
}

/** Lifecycle of a waiting-list entry. */
export type WaitingListEntryStatus =
  | "waiting"
  | "notified"
  | "booked"
  | "expired";

/** A single entry in a doctor's waiting list for a given date. */
export interface WaitingListEntry {
  id: string;
  /** Optional for walk-in/phone entries without a linked account. */
  patient_id?: string;
  patient_name?: string;
  doctor_id: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  phone?: string;
  priority: WaitingPriority;
  entry_type: WaitingEntryType;
  status: WaitingListEntryStatus;
  /** ISO 8601 timestamp. */
  created_at: string;
  notified_at?: string;
  /** Queue position. */
  position?: number;
}

/** Request body for `POST /v1/bookings/waiting-list`. */
export interface JoinWaitingListRequest {
  doctor_id: string;
  /** Optional for walk-in/phone entries. */
  patient_id?: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  priority?: WaitingPriority;
  phone?: string;
  patient_name?: string;
  entry_type?: WaitingEntryType;
}

/** Response for `GET /v1/bookings/waiting-list/:doctor_id/:date`. */
export type WaitingListResponse = WaitingListEntry[];

/** Request body for `POST /v1/bookings/start-visit`. */
export interface StartVisitRequest {
  id: string;
}

/** Request body for `POST /v1/bookings/complete-visit`. */
export interface CompleteVisitRequest {
  id: string;
}

/** Request body for `POST /v1/bookings/no-show`. */
export interface MarkNoShowRequest {
  id: string;
}

/** Request body for `POST /v1/bookings/waiting-list/:id/offer`. */
export interface OfferSlotRequest {
  entry_id: string;
  start_time: string;
  end_time: string;
}

/** Request body for `PATCH /v1/bookings/waiting-list/:id/priority`. */
export interface UpdateWaitingPriorityRequest {
  id: string;
  priority: WaitingPriority;
}

/** Daily aggregate counts for the monthly calendar view. */
export interface MonthlyAppointmentSummary {
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  total: number;
  pending: number;
  confirmed: number;
  checked_in: number;
  called: number;
  in_progress: number;
  completed: number;
  cancelled: number;
  no_show: number;
}

/** Shift metadata inside a daily timeline response. */
export interface TimelineShiftInfo {
  id: string;
  start_time: string;
  end_time: string;
  max_patients: number;
  is_active: boolean;
}

/** Daily timeline response from `GET /v1/bookings/timeline/:doctorID/:date`. */
export interface DailyTimelineResponse {
  doctor_id: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  shifts: TimelineShiftInfo[];
  appointments: Appointment[];
}

/** Lifecycle of an invoice. */
export type InvoiceStatus = "PARTIAL" | "SETTLED" | "FORFEITED";

/** Invoice / settlement record returned by the finance service. */
export interface Invoice {
  id: string;
  appointment_id: string;
  doctor_id: string;
  user_id: string;
  total_fee: number;
  /** Amount of the visit fee already collected up front. */
  deposit_paid: number;
  /** Amount credited to the doctor at settlement or forfeit. */
  doctor_share: number;
  status: InvoiceStatus;
  /** Payment channel used for this invoice. */
  payment_type?: PaymentType;
}
