/**
 * Prescription Management API client for the doctor portal.
 *
 * Mirrors the `USE_MOCK` + `delay()` pattern of
 * [`ehr-api.ts`](src/lib/ehr-api.ts). Every function resolves against the live
 * backend by default; flip {@link USE_MOCK} to `true` to exercise the synthetic
 * data branches without a running backend.
 */

import { apiClient } from "./api";
import type {
  CreatePrescriptionRequest,
  PrescriptionResponse,
  PrescriptionStatus,
  UpdatePrescriptionStatusRequest,
} from "@/types/prescription";

/**
 * Master switch for the mock layer. Defaults to `false` so the real endpoints
 * are used; flip to `true` to exercise the synthetic branches offline.
 */
export const USE_MOCK = false;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic 24-char hex-ish id generator for mock data. */
function mockHexId(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, "0").repeat(3).slice(0, 24);
}

/**
 * Create a prescription.
 *
 * Real endpoint: `POST /v1/prescriptions`.
 */
export async function createPrescription(
  req: CreatePrescriptionRequest,
): Promise<PrescriptionResponse> {
  if (USE_MOCK) {
    await delay(450);
    const now = new Date().toISOString();
    return {
      id: mockHexId(req.patient_id + now),
      patient_id: req.patient_id,
      doctor_id: "doc-mock",
      appointment_id: req.appointment_id,
      medical_record_id: req.medical_record_id,
      items: req.items.map((it) => ({
        drug_name: it.drug_name,
        rxcui: it.rxcui,
        dose: it.dose,
        frequency: it.frequency,
        duration: it.duration,
        sig: it.sig,
        quantity: it.quantity,
      })),
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
    };
  }

  const res = await apiClient.post<PrescriptionResponse>(
    "/v1/prescriptions",
    req,
  );
  return res.data;
}

/**
 * Fetch a single prescription by id.
 *
 * Real endpoint: `GET /v1/prescriptions/:id`.
 */
export async function getPrescription(
  id: string,
): Promise<PrescriptionResponse> {
  if (USE_MOCK) {
    await delay(300);
    const now = new Date().toISOString();
    return {
      id,
      patient_id: "pat-mock",
      doctor_id: "doc-mock",
      items: [],
      status: "ACTIVE",
      created_at: now,
      updated_at: now,
    };
  }

  const res = await apiClient.get<PrescriptionResponse>(
    `/v1/prescriptions/${id}`,
  );
  return res.data;
}

/**
 * List all prescriptions for a patient.
 *
 * Real endpoint: `GET /v1/prescriptions/patient/:patientId`.
 */
export async function listPrescriptionsByPatient(
  patientId: string,
): Promise<PrescriptionResponse[]> {
  if (USE_MOCK) {
    await delay(350);
    return [];
  }

  const res = await apiClient.get<PrescriptionResponse[]>(
    `/v1/prescriptions/patient/${patientId}`,
  );
  return res.data;
}

/**
 * List all prescriptions issued by a doctor.
 *
 * Real endpoint: `GET /v1/prescriptions/doctor/:doctorId`.
 */
export async function listPrescriptionsByDoctor(
  doctorId: string,
): Promise<PrescriptionResponse[]> {
  if (USE_MOCK) {
    await delay(350);
    return [];
  }

  const res = await apiClient.get<PrescriptionResponse[]>(
    `/v1/prescriptions/doctor/${doctorId}`,
  );
  return res.data;
}

/**
 * Update the lifecycle status of a prescription.
 *
 * Real endpoint: `PATCH /v1/prescriptions/:id/status`.
 */
export async function updatePrescriptionStatus(
  id: string,
  req: UpdatePrescriptionStatusRequest,
): Promise<PrescriptionResponse> {
  if (USE_MOCK) {
    await delay(300);
    const now = new Date().toISOString();
    const status: PrescriptionStatus = req.status;
    return {
      id,
      patient_id: "pat-mock",
      doctor_id: "doc-mock",
      items: [],
      status,
      created_at: now,
      updated_at: now,
    };
  }

  const res = await apiClient.patch<PrescriptionResponse>(
    `/v1/prescriptions/${id}/status`,
    req,
  );
  return res.data;
}
