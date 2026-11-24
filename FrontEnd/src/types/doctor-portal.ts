/**
 * Doctor Portal domain types.
 *
 * These describe the doctor's daily schedule/queue and monthly earnings
 * surfaced in the doctor portal. Field names are kept snake_case to match the
 * backend JSON payloads exactly.
 */

import type { AppointmentStatus } from "./booking";

/**
 * A single patient in the doctor's daily schedule/queue.
 *
 * `status` extends the standard appointment lifecycle with an extra `"IN_ROOM"`
 * value used only within the live queue view.
 */
export interface DoctorScheduleItem {
  appointment_id: string;
  patient_id: string;
  patient_name: string;
  /** `"HH:mm"`. */
  start_time: string;
  /** `"HH:mm"`. */
  end_time: string;
  /** Queue adds legacy `"WAITING"` / `"IN_ROOM"` aliases on top of lifecycle statuses. */
  status: AppointmentStatus | "WAITING" | "IN_ROOM";
  /** Visit reason / chief complaint. */
  reason: string;
  /** Whether a medical record already exists for this encounter. */
  has_ehr: boolean;
  /** Queue index when status is CONFIRMED or CHECKED_IN. */
  queue_position?: number;
  /**
   * ISO 8601 timestamp marking when the visit was started. The backend
   * populates this on `IN_PROGRESS` appointments (`StartVisit`).
   */
  visit_started_at?: string;
}

/** Aggregated daily schedule/queue for the signed-in doctor. */
export interface DoctorScheduleResponse {
  /** Hex ObjectID of the doctor this schedule belongs to. */
  doctor_id: string;
  /** `"YYYY-MM-DD"`. */
  date: string;
  total: number;
  waiting: number;
  in_room: number;
  completed: number;
  no_show: number;
  items: DoctorScheduleItem[];
}

/* -------------------------------------------------------------------------- */
/*  Earnings                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Earnings summary for the signed-in doctor over an inclusive date window.
 *
 * Returned by `GET /api/v1/finance/doctor/earnings?from=&to=` (YYYY-MM-DD).
 * Every field is aggregated server-side from invoices — no client-side fixture
 * data is involved.
 */
export interface DoctorEarningsSummary {
  /** Inclusive start date `"YYYY-MM-DD"`. */
  from: string;
  /** Inclusive end date `"YYYY-MM-DD"`. */
  to: string;
  /** Number of settled/forfeited visits in the window. */
  total_completed: number;
  /** Amount credited to the doctor's wallet in the window (Toman). */
  doctor_share: number;
  /** Fees paid by patients but not yet settled to the doctor (Toman). */
  pending_settlement: number;
  /** Number of PARTIAL (paid, awaiting settle) invoices in the window. */
  pending_count: number;
}

/** Date window passed to doctor earnings / transactions endpoints. */
export interface DoctorEarningsRange {
  from: string;
  to: string;
}

/**
 * Doctor wallet snapshot.
 *
 * Returned by the real endpoint `GET /api/v1/finance/doctor/wallet`.
 */
export interface DoctorWallet {
  /** Current wallet balance in Toman (0 when no wallet exists yet). */
  balance: number;
  currency: string;
}

/* -------------------------------------------------------------------------- */
/*  Doctor self-service profile settings                                      */
/* -------------------------------------------------------------------------- */

/**
 * The signed-in doctor's own profile settings.
 *
 * Returned by `GET /api/v1/doctor/profile` and accepted (the editable subset)
 * by `PUT /api/v1/doctor/profile`. The backend resolves the owner from the JWT,
 * so a doctor can only ever read/edit their own settings.
 */
export interface DoctorProfileSettings {
  /** Profile id. */
  id: string;
  /** Underlying auth user id (role DOCTOR). */
  user_id: string;
  specialty: string;
  medical_system_number: string;
  /** Default length of a single visit in minutes (editable by the doctor). */
  visit_duration_minutes: number;
  /** Fee charged for a single visit, in the smallest currency unit (editable). */
  visit_fee: number;
}

/** Payload accepted by `PUT /api/v1/doctor/profile` (doctor-owned fields only). */
export interface UpdateDoctorProfileSettingsRequest {
  visit_duration_minutes: number;
  visit_fee: number;
}
