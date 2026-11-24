/**
 * React Query hooks for doctor discovery reads.
 *
 * Query keys are namespaced + serialized so filters change the cache entry
 * identity. The time-slots hook is only `enabled` once both a doctor and a
 * date are present, avoiding empty fetches on first paint.
 */

import { useQuery } from "@tanstack/react-query";

import {
  fetchDoctorById,
  fetchDoctorShifts,
  fetchDoctors,
  fetchSpecialties,
  fetchTimeSlots,
} from "@/lib/doctor-api";
import type { DoctorFilters } from "@/types/doctor";

/** Root namespace for all doctor query keys. */
export const doctorKeys = {
  all: ["doctors"] as const,
  lists: () => [...doctorKeys.all, "list"] as const,
  list: (filters: DoctorFilters | undefined) =>
    [...doctorKeys.lists(), filters ?? {}] as const,
  details: () => [...doctorKeys.all, "detail"] as const,
  detail: (id: string) => [...doctorKeys.details(), id] as const,
  shifts: (id: string) => [...doctorKeys.all, "shifts", id] as const,
  slots: (id: string, date: string | undefined) =>
    [...doctorKeys.all, "slots", id, date ?? null] as const,
  specialties: () => [...doctorKeys.all, "specialties"] as const,
};

/**
 * Fetch the filterable list of doctors. Re-runs whenever `filters` identity
 * changes (so memoize the filters object at the call site or pass `undefined`).
 */
export function useDoctors(filters?: DoctorFilters) {
  return useQuery({
    queryKey: doctorKeys.list(filters),
    queryFn: () => fetchDoctors(filters),
  });
}

/** Fetch a single doctor by profile id. */
export function useDoctor(id: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.detail(id ?? ""),
    queryFn: () => fetchDoctorById(id as string),
    enabled: Boolean(id),
  });
}

/** Fetch upcoming shifts for a doctor. */
export function useDoctorShifts(doctorId: string | undefined) {
  return useQuery({
    queryKey: doctorKeys.shifts(doctorId ?? ""),
    queryFn: () => fetchDoctorShifts(doctorId as string),
    enabled: Boolean(doctorId),
  });
}

/**
 * Fetch bookable time slots for a doctor on a date.
 *
 * Disabled until both `doctorId` and `date` are provided.
 */
export function useTimeSlots(
  doctorId: string | undefined,
  date: string | undefined,
  visitDurationMinutes: number,
) {
  return useQuery({
    queryKey: doctorKeys.slots(doctorId ?? "", date),
    queryFn: () =>
      fetchTimeSlots(
        doctorId as string,
        date as string,
        visitDurationMinutes,
      ),
    enabled: Boolean(doctorId && date),
  });
}

/** Fetch the canonical specialty list for the discovery filter. */
export function useSpecialties() {
  return useQuery({
    queryKey: doctorKeys.specialties(),
    queryFn: fetchSpecialties,
    staleTime: Infinity, // static list, never refetch.
  });
}
