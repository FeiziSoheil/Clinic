/**
 * Admin-facing doctor & shift management types.
 *
 * These DTOs combine the user account fields from
 * [`internal/user/user.go`](../../../internal/user/user.go) with the doctor
 * profile fields from [`internal/clinic/clinic.go`](../../../internal/clinic/clinic.go),
 * and mirror the weekly shift shape driven by `internal/schedule/schedule.go`.
 *
 * Field names intentionally keep snake_case JSON keys to match the Go backend
 * DTOs verbatim (no camelCase transform), per the frontend conventions.
 *
 * NOTE: the patient-facing [`Doctor`](src/types/doctor.ts) type is richer (for
 * display) and is intentionally left untouched. This module is the admin-only
 * representation used by the `/admin/doctors` screens.
 */

/**
 * Days of the week.
 *
 * Values are the uppercase forms of Go's `time.Weekday.String()` (0=Sunday ..
 * 6=Saturday), matching the encoding used by the recurring-shift logic in
 * `internal/schedule/schedule.go`.
 */
export type DayOfWeek =
  | "SUNDAY"
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY";

/** Ordered list of the seven weekdays, starting at Sunday (Go index 0). */
export const DAYS_OF_WEEK: DayOfWeek[] = [
  "SUNDAY",
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
];

/** Account status mirror of the backend role/lifecycle flags. */
export type DoctorStatus = "ACTIVE" | "INACTIVE";

/**
 * Admin-facing doctor record.
 *
 * Merges the [`User`](../../../internal/user/user.go) identity fields with the
 * [`DoctorProfile`](../../../internal/clinic/clinic.go) professional fields for
 * table display.
 */
export interface AdminDoctor {
  /** Doctor profile id. */
  id: string;
  /** Underlying auth user id (role DOCTOR). */
  user_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  /** Optional email (display only; not part of the core Go User). */
  email?: string;
  /** Medical specialty (e.g. "Cardiology"). */
  specialty: string;
  /** Iranian medical-system registration number. */
  medical_system_number: string;
  /** Default length of a single visit in minutes. */
  visit_duration_minutes: number;
  /** Fee charged for a single visit, in the smallest currency unit (e.g. Toman). */
  visit_fee: number;
  /** Lifecycle status badge. */
  status: DoctorStatus;
  /** Whether the doctor account is currently bookable. */
  is_active: boolean;
  /** Patients linked to this doctor (admin roster + appointments − exclusions). */
  patient_count: number;
  /** Receptionists with employer_id = this doctor's user_id. */
  receptionist_count: number;
}

/**
 * A recurring weekly shift for a doctor.
 *
 * Mirrors the working-slot concept from `internal/schedule/schedule.go`, but
 * expressed as a weekday pattern (`day_of_week` + time range) rather than a
 * concrete calendar date, which is how the admin "weekly shifts" editor works.
 */
export interface WeeklyShift {
  id: string;
  doctor_id: string;
  day_of_week: DayOfWeek;
  /** Start time, `"HH:mm"` (24h). */
  start_time: string;
  /** End time, `"HH:mm"` (24h). */
  end_time: string;
  /** Whether the shift is currently bookable. */
  is_active: boolean;
}

/**
 * Payload to create a new doctor (user account + profile) from the admin UI.
 *
 * Combines [`CreateDoctorRequest`](../../../internal/user/user.go) identity
 * fields with [`CreateDoctorProfileRequest`](../../../internal/clinic/clinic.go)
 * professional fields.
 */
export interface CreateDoctorRequest {
  first_name: string;
  last_name: string;
  phone: string;
  /**
   * Login username for the DOCTOR account. Staff authenticate with username +
   * password (patients use OTP), so this is required when minting a doctor.
   */
  username: string;
  email?: string;
  /** Required on create; hashed in the service layer. */
  password: string;
  /**
   * National code. Required by the backend `CreateDoctorRequest`
   * ([`internal/user/user.go`](../../../internal/user/user.go)) when minting the
   * DOCTOR user account.
   */
  national_code: string;
  specialty: string;
  medical_system_number: string;
  visit_duration_minutes: number;
  visit_fee: number;
  status: DoctorStatus;
}

/**
 * Payload to edit an existing doctor. Omits `password` (managed elsewhere).
 */
export interface UpdateDoctorRequest {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  specialty: string;
  medical_system_number: string;
  visit_duration_minutes: number;
  visit_fee: number;
  status: DoctorStatus;
}

/** Payload to create or update a weekly shift for a doctor. */
export interface UpsertShiftRequest {
  day_of_week: DayOfWeek;
  start_time: string;
  end_time: string;
}

/** Optional filters accepted by the admin doctor listing. */
export interface AdminDoctorFilters {
  search?: string;
  specialty?: string;
}
