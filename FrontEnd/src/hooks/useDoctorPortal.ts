/**
 * React Query hooks for the Doctor Portal reads (schedule/queue, earnings &
 * wallet).
 *
 * Query keys are namespaced and parameterized by date/month so changing the
 * argument changes the cache entry identity.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchDoctorEarnings,
  fetchDoctorRevenueTransactions,
  fetchDoctorSchedule,
  fetchDoctorSettings,
  fetchDoctorWallet,
  updateDoctorSettings,
} from "@/lib/doctor-portal-api";
import type {
  DoctorEarningsRange,
  UpdateDoctorProfileSettingsRequest,
} from "@/types/doctor-portal";
import { toast } from "sonner";

/** Root namespace + helpers for all doctor-portal query keys. */
export const doctorPortalKeys = {
  all: ["doctor-portal"] as const,
  schedule: (date: string) =>
    [...doctorPortalKeys.all, "schedule", date] as const,
  earnings: (from: string, to: string) =>
    [...doctorPortalKeys.all, "earnings", from, to] as const,
  transactions: (from: string, to: string) =>
    [...doctorPortalKeys.all, "transactions", from, to] as const,
  wallet: ["doctor-portal", "wallet"] as const,
  settings: ["doctor-portal", "settings"] as const,
};

/** Fetch the signed-in doctor's daily schedule/queue. */
export function useDoctorSchedule(date: string) {
  return useQuery({
    queryKey: doctorPortalKeys.schedule(date),
    queryFn: () => fetchDoctorSchedule(date),
  });
}

/** Fetch the signed-in doctor's earnings summary for a date window. */
export function useDoctorEarnings(range: DoctorEarningsRange) {
  return useQuery({
    queryKey: doctorPortalKeys.earnings(range.from, range.to),
    queryFn: () => fetchDoctorEarnings(range),
    enabled: !!range.from && !!range.to && range.from <= range.to,
  });
}

/** Fetch the signed-in doctor's revenue-share transactions for a date window. */
export function useDoctorRevenueTransactions(range: DoctorEarningsRange) {
  return useQuery({
    queryKey: doctorPortalKeys.transactions(range.from, range.to),
    queryFn: () => fetchDoctorRevenueTransactions(range),
    enabled: !!range.from && !!range.to && range.from <= range.to,
  });
}

/** Fetch the signed-in doctor's wallet balance. */
export function useDoctorWallet() {
  return useQuery({
    queryKey: doctorPortalKeys.wallet,
    queryFn: () => fetchDoctorWallet(),
  });
}

/** Fetch the signed-in doctor's own profile settings (visit fee + duration). */
export function useDoctorSettings() {
  return useQuery({
    queryKey: doctorPortalKeys.settings,
    queryFn: () => fetchDoctorSettings(),
  });
}

/**
 * Update the signed-in doctor's own pricing settings. Invalidates the settings
 * cache and toasts success/failure.
 */
export function useUpdateDoctorSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: UpdateDoctorProfileSettingsRequest) =>
      updateDoctorSettings(req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: doctorPortalKeys.settings });
      toast.success("تنظیمات ویزیت ذخیره شد.");
    },
    onError: (err: unknown) => {
      toast.error("ذخیرهٔ تنظیمات ناموفق بود.", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
}
