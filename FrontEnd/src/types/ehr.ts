/**
 * EHR (Electronic Health Record) domain types.
 *
 * These interfaces mirror the Go DTOs in `internal/ehr/ehr.go` so the frontend
 * types line up with what the API returns. Field names are kept snake_case to
 * match the JSON payload exactly (no client-side transform).
 *
 * The central privacy rule mirrored here is that {@link MedicalRecordResponse}
 * (the patient view) deliberately omits `private_notes`, while
 * {@link MedicalRecordFullResponse} (the doctor/admin view) retains it.
 */

/** Whether a record was written as free-form fields or structured SOAP notes. */
export type MedicalRecordType = "GENERAL" | "SOAP";

/**
 * Patient-facing representation of a medical record.
 *
 * `private_notes` is intentionally absent so patient access can never leak the
 * doctor's confidential notes.
 */
export interface MedicalRecordResponse {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string;
  /** Legacy free-form complaint/observations field. */
  symptoms: string;
  /** Legacy free-form diagnosis field. */
  diagnosis: string;
  /** Legacy free-form prescription field. */
  prescription: string;
  /** SOAP: Subjective (the patient's reported history/chief complaint). */
  subjective?: string;
  /** SOAP: Objective (examiner observations, exam findings). */
  objective?: string;
  /** SOAP: Assessment (diagnosis / clinical impression). */
  assessment?: string;
  /** SOAP: Plan (treatment plan, orders, follow-up). */
  plan?: string;
  /** Whether the record is free-form (`GENERAL`) or structured SOAP. */
  record_type?: MedicalRecordType;
  /** ISO 8601 timestamp. */
  created_at: string;
}

/**
 * Doctor/admin view of a medical record.
 *
 * Identical to {@link MedicalRecordResponse} but also carries the
 * `private_notes` field which must only ever be returned to an authenticated
 * doctor or admin.
 */
export interface MedicalRecordFullResponse extends MedicalRecordResponse {
  /** Optional confidential notes for doctor/admin eyes only. */
  private_notes?: string;
}

/**
 * Request body for `POST /v1/ehr/medical-records` (doctor writes an EHR).
 *
 * `patient_id`, `doctor_id` and `appointment_id` are hex ObjectID strings.
 *
 * The legacy `symptoms`/`diagnosis`/`prescription` fields are kept optional so
 * that callers may instead supply the structured SOAP fields. Set
 * `complete_visit` to also mark the linked appointment/visit as completed.
 */
export interface CreateMedicalRecordRequest {
  patient_id: string;
  doctor_id: string;
  appointment_id: string;
  symptoms?: string;
  diagnosis?: string;
  prescription?: string;
  /** Optional confidential notes for doctor/admin eyes only. */
  private_notes?: string;
  /** SOAP: Subjective. */
  subjective?: string;
  /** SOAP: Objective. */
  objective?: string;
  /** SOAP: Assessment. */
  assessment?: string;
  /** SOAP: Plan. */
  plan?: string;
  /** If `true`, also mark the linked visit/appointment as completed. */
  complete_visit?: boolean;
}

/* -------------------------------------------------------------------------- */
/*  Triage                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Measured/observed patient vitals captured during triage.
 *
 * All fields are optional — a triage note may be saved with only a subset.
 */
export interface Vitals {
  /** e.g. `"120/80"`. */
  blood_pressure?: string;
  /** Beats per minute. */
  heart_rate?: number;
  /** Degrees Celsius. */
  temperature?: number;
  /** Breaths per minute. */
  respiratory_rate?: number;
  /** Percentage (0–100). */
  oxygen_saturation?: number;
  /** Kilograms. */
  weight?: number;
  /** Centimeters. */
  height?: number;
}

/**
 * A triage note created for a patient (typically linked to an appointment).
 *
 * Mirrors the backend triage response payload; field names match the JSON keys.
 */
export interface TriageNoteResponse {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id: string;
  /** Free-form list of reported symptoms. */
  symptoms: string[];
  /** Measured vitals, if any were captured. */
  vitals?: Vitals;
  /** Free-form triage notes. */
  notes: string;
  /** ISO 8601 timestamp. */
  created_at: string;
}

/**
 * Request body for `POST /v1/ehr/triage` (doctor/nurse writes a triage note).
 */
export interface CreateTriageNoteRequest {
  patient_id: string;
  doctor_id: string;
  appointment_id: string;
  symptoms?: string[];
  vitals?: Vitals;
  notes?: string;
}

/* -------------------------------------------------------------------------- */
/*  Doctor patient list                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Summary row for one of the signed-in doctor's patients.
 *
 * Mirrors the JSON payload returned by `GET /api/v1/ehr/doctor/patients`
 * (a bare JSON array sorted by `last_visit` desc). Field names match the JSON
 * keys exactly (no client-side transform). `last_visit` may be `null` when the
 * patient has no visits yet.
 */
export interface DoctorPatientSummary {
  patient_id: string;
  first_name: string;
  last_name: string;
  phone: string;
  national_code: string;
  total_visits: number;
  completed_visits: number;
  /** ISO 8601 timestamp of the most recent visit, or `null`. */
  last_visit: string | null;
  last_diagnosis: string;
}
