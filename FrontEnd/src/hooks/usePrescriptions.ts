/**
 * React Query hooks for the Prescription Management flow.
 *
 * Mirrors [`useEhr.ts`](src/hooks/useEhr.ts): a namespaced query-key factory,
 * list/detail queries, and create / status-update mutations that invalidate the
 * relevant cache slices and surface `sonner` toasts. (Drug search lives in
 * [`useMedicines.ts`](src/hooks/useMedicines.ts).)
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createPrescription,
  getPrescription,
  listPrescriptionsByDoctor,
  listPrescriptionsByPatient,
  updatePrescriptionStatus,
} from "@/lib/prescription-api";
import type {
  CreatePrescriptionRequest,
  UpdatePrescriptionStatusRequest,
} from "@/types/prescription";

/** Root namespace + helpers for all prescription query keys. */
export const prescriptionKeys = {
  all: ["prescriptions"] as const,
  forPatient: (patientId: string) =>
    [...prescriptionKeys.all, "patient", patientId] as const,
  forDoctor: (doctorId: string) =>
    [...prescriptionKeys.all, "doctor", doctorId] as const,
  detail: (id: string) => [...prescriptionKeys.all, "detail", id] as const,
};

/**
 * Create a prescription.
 *
 * On success the whole prescriptions namespace is invalidated so any open
 * history views refetch, and a success toast is shown.
 */
export function useCreatePrescription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CreatePrescriptionRequest) => createPrescription(req),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: prescriptionKeys.all });
      void queryClient.invalidateQueries({
        queryKey: prescriptionKeys.forPatient(variables.patient_id),
      });
      toast.success("نسخه با موفقیت صادر شد");
    },
    onError: (err: unknown) => {
      toast.error("صدور نسخه ناموفق بود.", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
}

/**
 * List all prescriptions issued by a doctor.
 *
 * Disabled until `doctorId` is provided.
 */
export function usePrescriptionsByDoctor(doctorId: string | undefined) {
  return useQuery({
    queryKey: prescriptionKeys.forDoctor(doctorId ?? ""),
    queryFn: () => listPrescriptionsByDoctor(doctorId as string),
    enabled: Boolean(doctorId),
  });
}

/**
 * List all prescriptions for a patient.
 *
 * Disabled until `patientId` is provided.
 */
export function usePrescriptionsByPatient(patientId: string | undefined) {
  return useQuery({
    queryKey: prescriptionKeys.forPatient(patientId ?? ""),
    queryFn: () => listPrescriptionsByPatient(patientId as string),
    enabled: Boolean(patientId),
  });
}

/**
 * Fetch a single prescription by id.
 *
 * Disabled until `id` is provided.
 */
export function usePrescription(id: string | undefined) {
  return useQuery({
    queryKey: prescriptionKeys.detail(id ?? ""),
    queryFn: () => getPrescription(id as string),
    enabled: Boolean(id),
  });
}

/**
 * Update the lifecycle status of a prescription. Invalidates the prescriptions
 * namespace on success and toasts success/failure.
 */
export function useUpdatePrescriptionStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      req,
    }: {
      id: string;
      req: UpdatePrescriptionStatusRequest;
    }) => updatePrescriptionStatus(id, req),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: prescriptionKeys.all });
      void queryClient.invalidateQueries({
        queryKey: prescriptionKeys.detail(data.id),
      });
      toast.success("وضعیت نسخه به‌روزرسانی شد");
    },
    onError: (err: unknown) => {
      toast.error("به‌روزرسانی وضعیت نسخه ناموفق بود.", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
}
