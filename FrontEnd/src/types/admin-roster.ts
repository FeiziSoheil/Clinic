/**
 * Admin-facing patient & receptionist (secretary) types for per-doctor roster
 * CRUD under `/admin/doctors/[id]/patients` and
 * `/admin/doctors/[id]/receptionists`.
 *
 * Field names keep snake_case JSON keys to match the Go backend DTOs in
 * `internal/user/user.go` verbatim.
 */

/** PATIENT account assigned to a doctor (employer_id = doctor user id). */
export interface AdminPatient {
  id: string;
  phone: string;
  role: "PATIENT";
  first_name: string;
  last_name: string;
  national_code: string;
  /** Hex id of the doctor this patient is assigned to. */
  employer_id?: string;
}

/** Payload to create a patient under a doctor (OTP login — no password). */
export interface CreateAdminPatientRequest {
  phone: string;
  first_name: string;
  last_name: string;
  national_code: string;
}

/** Payload to update a patient under a doctor. */
export interface UpdateAdminPatientRequest {
  phone: string;
  first_name: string;
  last_name: string;
  national_code: string;
}

/**
 * RECEPTIONIST (منشی) account scoped to a doctor.
 * Reuses the same shape as the doctor-portal ReceptionistResponse.
 */
export interface AdminReceptionist {
  id: string;
  phone: string;
  username?: string;
  role: "RECEPTIONIST";
  first_name: string;
  last_name: string;
  national_code: string;
  employer_id?: string;
}

/** Payload to create a receptionist under a doctor. */
export interface CreateAdminReceptionistRequest {
  phone: string;
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  national_code: string;
}

/**
 * Payload to update a receptionist. Password is optional — omit or leave empty
 * to keep the existing hash.
 */
export interface UpdateAdminReceptionistRequest {
  phone: string;
  username: string;
  password?: string;
  first_name: string;
  last_name: string;
  national_code: string;
}
