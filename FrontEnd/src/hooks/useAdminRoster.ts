/**
 * React Query hooks for admin per-doctor patient & receptionist CRUD.
 *
 * Query keys are scoped by doctor user id so caches stay isolated across
 * doctors. Mutations invalidate the matching list and toast in Persian.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createDoctorPatient,
  createDoctorReceptionist,
  deleteDoctorPatient,
  deleteDoctorReceptionist,
  listDoctorPatients,
  listDoctorReceptionists,
  updateDoctorPatient,
  updateDoctorReceptionist,
} from "@/lib/admin-roster-api";
import type {
  CreateAdminPatientRequest,
  CreateAdminReceptionistRequest,
  UpdateAdminPatientRequest,
  UpdateAdminReceptionistRequest,
} from "@/types/admin-roster";

/** Root namespace + factory for admin roster query keys. */
export const adminRosterKeys = {
  all: ["admin-roster"] as const,
  patients: (doctorUserId: string) =>
    [...adminRosterKeys.all, "patients", doctorUserId] as const,
  receptionists: (doctorUserId: string) =>
    [...adminRosterKeys.all, "receptionists", doctorUserId] as const,
};

/** List patients assigned to a doctor. Disabled until a user id is provided. */
export function useAdminDoctorPatients(doctorUserId: string | undefined) {
  return useQuery({
    queryKey: adminRosterKeys.patients(doctorUserId ?? ""),
    queryFn: () => listDoctorPatients(doctorUserId as string),
    enabled: Boolean(doctorUserId),
  });
}

/** Create a patient under a doctor. */
export function useCreateAdminPatient(doctorUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateAdminPatientRequest) =>
      createDoctorPatient(doctorUserId as string, req),
    onSuccess: (patient) => {
      toast.success("بیمار با موفقیت افزوده شد.", {
        description: `${patient.first_name} ${patient.last_name}`,
      });
      void queryClient.invalidateQueries({
        queryKey: adminRosterKeys.patients(doctorUserId ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error("افزودن بیمار ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Update a patient under a doctor. */
export function useUpdateAdminPatient(doctorUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      patientId,
      req,
    }: {
      patientId: string;
      req: UpdateAdminPatientRequest;
    }) => updateDoctorPatient(doctorUserId as string, patientId, req),
    onSuccess: (patient) => {
      toast.success("اطلاعات بیمار به‌روز شد.", {
        description: `${patient.first_name} ${patient.last_name}`,
      });
      void queryClient.invalidateQueries({
        queryKey: adminRosterKeys.patients(doctorUserId ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error("ویرایش بیمار ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Remove a patient from a doctor (unlink) or hard-delete the account. */
export function useDeleteAdminPatient(doctorUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      patientId,
      mode,
    }: {
      patientId: string;
      mode: "unlink" | "hard";
    }) => deleteDoctorPatient(doctorUserId as string, patientId, mode),
    onSuccess: (_data, vars) => {
      toast.success(
        vars.mode === "hard"
          ? "حساب بیمار برای همیشه حذف شد."
          : "بیمار از فهرست این پزشک حذف شد.",
      );
      void queryClient.invalidateQueries({
        queryKey: adminRosterKeys.patients(doctorUserId ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error("حذف بیمار ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** List receptionists scoped to a doctor. Disabled until a user id is provided. */
export function useAdminDoctorReceptionists(doctorUserId: string | undefined) {
  return useQuery({
    queryKey: adminRosterKeys.receptionists(doctorUserId ?? ""),
    queryFn: () => listDoctorReceptionists(doctorUserId as string),
    enabled: Boolean(doctorUserId),
  });
}

/** Create a receptionist under a doctor. */
export function useCreateAdminReceptionist(doctorUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateAdminReceptionistRequest) =>
      createDoctorReceptionist(doctorUserId as string, req),
    onSuccess: (receptionist) => {
      toast.success("منشی با موفقیت افزوده شد.", {
        description: `${receptionist.first_name} ${receptionist.last_name}`,
      });
      void queryClient.invalidateQueries({
        queryKey: adminRosterKeys.receptionists(doctorUserId ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error("افزودن منشی ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Update a receptionist under a doctor. */
export function useUpdateAdminReceptionist(doctorUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      receptionistId,
      req,
    }: {
      receptionistId: string;
      req: UpdateAdminReceptionistRequest;
    }) =>
      updateDoctorReceptionist(doctorUserId as string, receptionistId, req),
    onSuccess: (receptionist) => {
      toast.success("اطلاعات منشی به‌روز شد.", {
        description: `${receptionist.first_name} ${receptionist.last_name}`,
      });
      void queryClient.invalidateQueries({
        queryKey: adminRosterKeys.receptionists(doctorUserId ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error("ویرایش منشی ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Delete a receptionist under a doctor. */
export function useDeleteAdminReceptionist(doctorUserId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receptionistId: string) =>
      deleteDoctorReceptionist(doctorUserId as string, receptionistId),
    onSuccess: () => {
      toast.success("منشی حذف شد.");
      void queryClient.invalidateQueries({
        queryKey: adminRosterKeys.receptionists(doctorUserId ?? ""),
      });
    },
    onError: (err: unknown) => {
      toast.error("حذف منشی ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}
