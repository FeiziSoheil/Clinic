/**
 * Prescription Management domain types.
 *
 * These interfaces mirror the Go DTOs in `internal/prescription/prescription.go`
 * so the frontend types line up with what the API returns. Field names are kept
 * snake_case to match the JSON payload exactly (no client-side transform).
 *
 * The privacy split mirrors the backend: {@link PrescriptionResponse} omits the
 * doctor-only `notes` (it is never sent to a patient), while the request types
 * carry it for create operations.
 */

/** Lifecycle state of a prescription (typed string enum, JSON/bson friendly). */
export type PrescriptionStatus = "ACTIVE" | "COMPLETED" | "CANCELLED";

/**
 * A single drug line on a prescription (drug name, RxNorm CUI, dose, frequency,
 * duration, sig instructions and dispense quantity).
 */
export interface PrescriptionItem {
  /** Human-readable drug name. */
  drug_name: string;
  /** RxNorm Concept Unique Identifier (may be empty when entered freehand). */
  rxcui: string;
  /** Strength/amount per administration, e.g. `"500mg"`. */
  dose: string;
  /** How often the drug is taken, e.g. `"twice daily"`. */
  frequency: string;
  /** How long the course runs, e.g. `"7 days"`. */
  duration: string;
  /** Free-text patient instructions. */
  sig: string;
  /** Dispense quantity, e.g. `"30 tablets"`. Optional. */
  quantity?: string;
}

/**
 * Prescription response payload (the patient-safe view). The doctor-only
 * `notes` field is intentionally absent so patient access can never leak it.
 */
export interface PrescriptionResponse {
  id: string;
  patient_id: string;
  doctor_id: string;
  appointment_id?: string;
  medical_record_id?: string;
  items: PrescriptionItem[];
  status: PrescriptionStatus;
  /** ISO 8601 timestamp. */
  created_at: string;
  /** ISO 8601 timestamp of the most recent mutation. */
  updated_at: string;
  /**
   * Patient display name, denormalized server-side from the users collection
   * (best-effort; may be empty when the user could not be resolved).
   */
  patient_name?: string;
  /** Doctor display name, denormalized server-side (best-effort; may be empty). */
  doctor_name?: string;
}

/**
 * Payload for a single drug line when creating a prescription. Mirrors the
 * {@link PrescriptionItem} fields as plain strings so it is JSON-friendly.
 */
export interface CreatePrescriptionItemRequest {
  drug_name: string;
  rxcui: string;
  dose: string;
  frequency: string;
  duration: string;
  sig: string;
  quantity?: string;
}

/**
 * Request body for `POST /v1/prescriptions`. `patient_id` is a required hex
 * ObjectID; the appointment and medical record ids are optional hex strings. At
 * least one drug item must be supplied.
 */
export interface CreatePrescriptionRequest {
  patient_id: string;
  appointment_id?: string;
  medical_record_id?: string;
  items: CreatePrescriptionItemRequest[];
  /** Optional doctor-only clinical context (never shown to patients). */
  notes?: string;
  /** When `true`, trigger a best-effort patient notification. */
  notify_patient?: boolean;
}

/** Request body for `PATCH /v1/prescriptions/:id/status`. */
export interface UpdatePrescriptionStatusRequest {
  status: PrescriptionStatus;
}
