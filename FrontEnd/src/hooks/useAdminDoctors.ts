/**
 * React Query hooks for admin doctor & weekly-shift management.
 *
 * Query keys follow the `<domain>Keys` factory pattern (see
 * [`useDoctors.ts`](src/hooks/useDoctors.ts)). Mutations invalidate the
 * appropriate cache slices and surface success/error toasts via sonner.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createDoctor,
  deleteDoctor,
  deleteDoctorShift,
  fetchAdminDoctor,
  fetchAdminDoctors,
  fetchDoctorShifts,
  updateDoctor,
  upsertDoctorShift,
} from "@/lib/admin-doctor-api";
import type {
  AdminDoctorFilters,
  CreateDoctorRequest,
  UpdateDoctorRequest,
  UpsertShiftRequest,
} from "@/types/admin-doctor";

/** Root namespace + factory for all admin-doctor query keys. */
export const adminDoctorKeys = {
  all: ["admin-doctors"] as const,
  lists: () => [...adminDoctorKeys.all, "list"] as const,
  list: (filters: AdminDoctorFilters | undefined) =>
    [...adminDoctorKeys.lists(), filters ?? {}] as const,
  details: () => [...adminDoctorKeys.all, "detail"] as const,
  detail: (id: string) => [...adminDoctorKeys.details(), id] as const,
  shifts: (id: string) => [...adminDoctorKeys.all, "shifts", id] as const,
};

/** Fetch the filterable admin doctor list. */
export function useAdminDoctors(filters?: AdminDoctorFilters) {
  return useQuery({
    queryKey: adminDoctorKeys.list(filters),
    queryFn: () => fetchAdminDoctors(filters),
  });
}

/** Fetch a single admin doctor. Disabled until an id is provided. */
export function useAdminDoctor(id: string | undefined) {
  return useQuery({
    queryKey: adminDoctorKeys.detail(id ?? ""),
    queryFn: () => fetchAdminDoctor(id as string),
    enabled: Boolean(id),
  });
}

/** Create a new doctor. Invalidates the list cache on success. */
export function useCreateDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateDoctorRequest) => createDoctor(req),
    onSuccess: (doctor) => {
      toast.success(`Doctor ${doctor.first_name} ${doctor.last_name} created.`);
      void queryClient.invalidateQueries({ queryKey: adminDoctorKeys.lists() });
    },
    onError: (err: unknown) => {
      toast.error("Failed to create doctor.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Update an existing doctor. Invalidates the list + detail cache. */
export function useUpdateDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, req }: { id: string; req: UpdateDoctorRequest }) =>
      updateDoctor(id, req),
    onSuccess: (doctor) => {
      toast.success(`Doctor ${doctor.first_name} ${doctor.last_name} updated.`);
      void queryClient.invalidateQueries({ queryKey: adminDoctorKeys.lists() });
      void queryClient.invalidateQueries({
        queryKey: adminDoctorKeys.detail(doctor.id),
      });
    },
    onError: (err: unknown) => {
      toast.error("Failed to update doctor.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Delete a doctor. Invalidates the list cache on success. */
export function useDeleteDoctor() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteDoctor(id),
    onSuccess: () => {
      toast.success("Doctor deleted.");
      void queryClient.invalidateQueries({ queryKey: adminDoctorKeys.all });
    },
    onError: (err: unknown) => {
      toast.error("Failed to delete doctor.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Fetch the weekly shifts for a doctor. Disabled until an id is provided. */
export function useDoctorShifts(doctorId: string | undefined) {
  return useQuery({
    queryKey: adminDoctorKeys.shifts(doctorId ?? ""),
    queryFn: () => fetchDoctorShifts(doctorId as string),
    enabled: Boolean(doctorId),
  });
}

/** Create or update a weekly shift. Invalidates the doctor's shifts cache. */
export function useUpsertDoctorShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      doctorId,
      req,
    }: {
      doctorId: string;
      req: UpsertShiftRequest;
    }) => upsertDoctorShift(doctorId, req),
    onSuccess: (_data, { doctorId }) => {
      toast.success("Shift saved.");
      void queryClient.invalidateQueries({
        queryKey: adminDoctorKeys.shifts(doctorId),
      });
    },
    onError: (err: unknown) => {
      toast.error("Failed to save shift.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Remove a weekly shift. Invalidates the doctor's shifts cache. */
export function useDeleteDoctorShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ doctorId, shiftId }: { doctorId: string; shiftId: string }) =>
      deleteDoctorShift(doctorId, shiftId),
    onSuccess: (_data, { doctorId }) => {
      toast.success("Shift removed.");
      void queryClient.invalidateQueries({
        queryKey: adminDoctorKeys.shifts(doctorId),
      });
    },
    onError: (err: unknown) => {
      toast.error("Failed to remove shift.", {
        description: (err as Error)?.message,
      });
    },
  });
}
