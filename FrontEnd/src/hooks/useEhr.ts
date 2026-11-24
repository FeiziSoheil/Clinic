/**
 * React Query hooks for the EHR (Electronic Health Record) flow.
 *
 * The query hooks are gated on an id (patient/appointment) to avoid empty
 * fetches on first paint. Mutations invalidate both the whole ehr namespace and
 * the relevant cache slices so any open views refetch automatically.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createMedicalRecord,
  createTriageNote,
  fetchPatientEhr,
  fetchPatientMedicalRecords,
  fetchTriageByAppointment,
  fetchTriageByPatient,
  getDoctorPatients,
} from "@/lib/ehr-api";
import type {
  CreateMedicalRecordRequest,
  CreateTriageNoteRequest,
  TriageNoteResponse,
} from "@/types/ehr";

/** Root namespace + helpers for all ehr query keys. */
export const ehrKeys = {
  all: ["ehr"] as const,
  detail: (patientId: string) => [...ehrKeys.all, "patient", patientId] as const,
  history: (patientId: string) =>
    [...ehrKeys.all, "history", patientId] as const,
  triagePatient: (patientId: string) =>
    [...ehrKeys.all, "triage", "patient", patientId] as const,
  triageAppointment: (appointmentId: string) =>
    [...ehrKeys.all, "triage", "appointment", appointmentId] as const,
  patients: ["ehr", "doctor-patients"] as const,
};

/**
 * Fetch a patient's latest medical record.
 *
 * Disabled until `patientId` is provided.
 */
export function usePatientEhr(patientId: string | undefined) {
  return useQuery({
    queryKey: ehrKeys.detail(patientId ?? ""),
    queryFn: () => fetchPatientEhr(patientId as string),
    enabled: Boolean(patientId),
  });
}

/**
 * Fetch ALL medical records for a patient (the full SOAP/general history).
 *
 * Disabled until `patientId` is provided.
 */
export function usePatientMedicalRecords(patientId: string | undefined) {
  return useQuery({
    queryKey: ehrKeys.history(patientId ?? ""),
    queryFn: () => fetchPatientMedicalRecords(patientId as string),
    enabled: Boolean(patientId),
  });
}

/**
 * Create a medical record (doctor writes an EHR).
 *
 * On success the ehr namespace and the affected patient's record are
 * invalidated so any open views refetch automatically.
 */
export function useCreateMedicalRecord() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreateMedicalRecordRequest) => createMedicalRecord(req),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ehrKeys.all });
      void queryClient.invalidateQueries({
        queryKey: ehrKeys.detail(variables.patient_id),
      });
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Triage                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Create a triage note. Invalidates the whole ehr namespace (incl. triage keys)
 * on success so any open patient/appointment views refetch.
 */
export function useCreateTriageNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreateTriageNoteRequest) => createTriageNote(req),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ehrKeys.all });
      void queryClient.invalidateQueries({
        queryKey: ehrKeys.triagePatient(variables.patient_id),
      });
      void queryClient.invalidateQueries({
        queryKey: ehrKeys.triageAppointment(variables.appointment_id),
      });
    },
  });
}

/**
 * Fetch all triage notes for a patient.
 *
 * Disabled until `patientId` is provided.
 */
export function usePatientTriage(patientId: string | undefined) {
  return useQuery({
    queryKey: ehrKeys.triagePatient(patientId ?? ""),
    queryFn: () => fetchTriageByPatient(patientId as string),
    enabled: Boolean(patientId),
  });
}

/**
 * Fetch all triage notes linked to an appointment.
 *
 * Disabled until `appointmentId` is provided.
 */
export function useAppointmentTriage(appointmentId: string | undefined) {
  return useQuery({
    queryKey: ehrKeys.triageAppointment(appointmentId ?? ""),
    queryFn: (): Promise<TriageNoteResponse[]> =>
      fetchTriageByAppointment(appointmentId as string),
    enabled: Boolean(appointmentId),
  });
}

/**
 * Fetch the signed-in doctor's patients (the "بیماران من" list).
 *
 * Toasts a Persian error message when the request fails.
 */
export function useDoctorPatients() {
  return useQuery({
    queryKey: ehrKeys.patients,
    queryFn: () => getDoctorPatients(),
  });
}
