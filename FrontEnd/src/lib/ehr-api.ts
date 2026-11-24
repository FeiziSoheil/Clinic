/**
 * EHR (Electronic Health Record) operations for the doctor portal.
 *
 * The backend EHR write/read endpoints are not yet wired into the doctor
 * portal, so every function here resolves against the mock layer with a
 * simulated network delay. To go live, flip {@link USE_MOCK} to `false` — the
 * function signatures and return types already match the ideal contract.
 *
 * Mirrors the `USE_MOCK` + `delay()` pattern of
 * [`doctor-api.ts`](src/lib/doctor-api.ts).
 */

import { apiClient } from "./api";
import { hashString } from "./mock-data";
import type {
  CreateMedicalRecordRequest,
  CreateTriageNoteRequest,
  DoctorPatientSummary,
  MedicalRecordResponse,
  TriageNoteResponse,
} from "@/types/ehr";

/**
 * Master switch for the mock layer. Flip to `false` once the real endpoints
 * listed below are deployed.
 */
export const USE_MOCK = false;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a medical record (doctor writes an EHR).
 *
 * Real endpoint: `POST /v1/ehr/medical-records`.
 *
 * The request now also accepts the structured SOAP fields
 * (`subjective`/`objective`/`assessment`/`plan`) and the `complete_visit`
 * flag — these are simply forwarded to the backend when present. Legacy
 * `symptoms`/`diagnosis`/`prescription` remain optional.
 *
 * In mock mode a {@link MedicalRecordResponse} is synthesized by building ids
 * and stamping `created_at` with the current time.
 */
export async function createMedicalRecord(
  req: CreateMedicalRecordRequest,
): Promise<MedicalRecordResponse> {
  if (USE_MOCK) {
    await delay(450);
    return {
      id: `rec-${hashString(req.appointment_id).toString(16).padStart(8, "0")}`,
      patient_id: req.patient_id,
      doctor_id: req.doctor_id,
      appointment_id: req.appointment_id,
      symptoms: req.symptoms ?? "",
      diagnosis: req.diagnosis ?? "",
      prescription: req.prescription ?? "",
      subjective: req.subjective,
      objective: req.objective,
      assessment: req.assessment,
      plan: req.plan,
      record_type:
        req.subjective || req.objective || req.assessment || req.plan
          ? "SOAP"
          : "GENERAL",
      created_at: new Date().toISOString(),
    };
  }

  const res = await apiClient.post<MedicalRecordResponse>(
    "/v1/ehr/medical-records",
    req,
  );
  return res.data;
}

/**
 * Fetch a patient's latest medical record.
 *
 * Real endpoint: `GET /v1/ehr/records/:patientId`.
 *
 * In mock mode the existence of a record is decided deterministically via
 * `hashString(patientId)` (~30% chance a record exists); otherwise `null` is
 * returned.
 */
export async function fetchPatientEhr(
  patientId: string,
): Promise<MedicalRecordResponse | null> {
  if (USE_MOCK) {
    await delay(350);
    // ~30% of patients have an existing record.
    if (hashString(patientId) % 100 >= 30) {
      return null;
    }

    const seed = hashString(patientId);
    return {
      id: `rec-${seed.toString(16).padStart(8, "0")}`,
      patient_id: patientId,
      doctor_id: "doc-1001",
      appointment_id: `apt-${(seed >>> 4).toString(16).padStart(8, "0")}`,
      symptoms: "Persistent cough and mild fever for 3 days.",
      diagnosis: "Acute upper respiratory tract infection.",
      prescription: "Rest, fluids, paracetamol 500mg every 6 hours as needed.",
      created_at: new Date(Date.now() - seed * 1000).toISOString(),
    };
  }

  // The backend lists ALL of a patient's records (ListByPatient). The portal
  // shows the most recent one, so we take the first element (the service returns
  // them newest-first) or null when none exist yet.
  const res = await apiClient.get<MedicalRecordResponse[]>(
    `/v1/ehr/medical-records/patient/${patientId}`,
  );
  return res.data.length > 0 ? res.data[0] : null;
}

/**
 * Fetch ALL of a patient's medical records (the full SOAP/general history).
 *
 * Real endpoint: `GET /v1/ehr/medical-records/patient/:patientId`.
 *
 * The backend returns the records newest-first. Unlike {@link fetchPatientEhr}
 * (which returns only the latest record) this returns the whole list so the
 * medical-history timeline can render every past encounter.
 */
export async function fetchPatientMedicalRecords(
  patientId: string,
): Promise<MedicalRecordResponse[]> {
  if (USE_MOCK) {
    await delay(350);
    // ~30% of patients have an existing record.
    if (hashString(patientId) % 100 >= 30) {
      return [];
    }

    const seed = hashString(patientId);
    return [
      {
        id: `rec-${seed.toString(16).padStart(8, "0")}`,
        patient_id: patientId,
        doctor_id: "doc-1001",
        appointment_id: `apt-${(seed >>> 4).toString(16).padStart(8, "0")}`,
        symptoms: "Persistent cough and mild fever for 3 days.",
        diagnosis: "Acute upper respiratory tract infection.",
        prescription: "Rest, fluids, paracetamol 500mg every 6 hours as needed.",
        created_at: new Date(Date.now() - seed * 1000).toISOString(),
      },
    ];
  }

  const res = await apiClient.get<MedicalRecordResponse[]>(
    `/v1/ehr/medical-records/patient/${patientId}`,
  );
  return res.data;
}

/* -------------------------------------------------------------------------- */
/*  Triage notes                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Create a triage note for a patient (linked to a doctor + appointment).
 *
 * Real endpoint: `POST /v1/ehr/triage`.
 */
export async function createTriageNote(
  req: CreateTriageNoteRequest,
): Promise<TriageNoteResponse> {
  if (USE_MOCK) {
    await delay(400);
    return {
      id: `tri-${hashString(req.patient_id + req.appointment_id)
        .toString(16)
        .padStart(8, "0")}`,
      patient_id: req.patient_id,
      doctor_id: req.doctor_id,
      appointment_id: req.appointment_id,
      symptoms: req.symptoms ?? [],
      vitals: req.vitals,
      notes: req.notes ?? "",
      created_at: new Date().toISOString(),
    };
  }

  const res = await apiClient.post<TriageNoteResponse>("/v1/ehr/triage", req);
  return res.data;
}

/**
 * Fetch all triage notes for a patient.
 *
 * Real endpoint: `GET /v1/ehr/triage/patient/:patientId`.
 */
export async function fetchTriageByPatient(
  patientId: string,
): Promise<TriageNoteResponse[]> {
  if (USE_MOCK) {
    await delay(300);
    return [];
  }

  const res = await apiClient.get<TriageNoteResponse[]>(
    `/v1/ehr/triage/patient/${patientId}`,
  );
  return res.data;
}

/**
 * Fetch all triage notes linked to a specific appointment.
 *
 * Real endpoint: `GET /v1/ehr/triage/appointment/:appointmentId`.
 */
export async function fetchTriageByAppointment(
  appointmentId: string,
): Promise<TriageNoteResponse[]> {
  if (USE_MOCK) {
    await delay(300);
    return [];
  }

  const res = await apiClient.get<TriageNoteResponse[]>(
    `/v1/ehr/triage/appointment/${appointmentId}`,
  );
  return res.data;
}

/* -------------------------------------------------------------------------- */
/*  Doctor patient list                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the signed-in doctor's patients (the "بیماران من" list).
 *
 * Real endpoint: `GET /api/v1/ehr/doctor/patients`.
 *
 * The backend returns a bare JSON array (no envelope) sorted by `last_visit`
 * desc; an empty `[]` is returned when the doctor has no patients yet. This is
 * a live read-only endpoint so there is no mock branch.
 */
export async function getDoctorPatients(): Promise<DoctorPatientSummary[]> {
  const res = await apiClient.get<DoctorPatientSummary[]>(
    "/v1/ehr/doctor/patients",
  );
  return res.data;
}
