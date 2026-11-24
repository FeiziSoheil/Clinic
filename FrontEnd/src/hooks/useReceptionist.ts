/**
 * React Query hooks for doctor-side receptionist management.
 *
 * Exposes a list query (`useListReceptionists`) backed by
 * `GET /v1/doctor/receptionists` and a create mutation
 * (`useCreateReceptionist`) that invalidates the list on success so a freshly
 * created receptionist appears in the list immediately. Success/error are
 * surfaced via sonner toasts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createReceptionist, listReceptionists } from "@/lib/receptionist-api";
import type { ReceptionistRequest } from "@/types/user";

/**
 * Shared TanStack Query key for the signed-in doctor's receptionists list.
 * Exported so callers (and mutations) can invalidate it consistently.
 */
export const receptionistsQueryKey = ["doctor", "receptionists"] as const;

/**
 * List the receptionists scoped to the signed-in doctor.
 *
 * Refetches on window focus so newly created receptionists (by this or another
 * session) show up without a manual refresh.
 */
export function useListReceptionists() {
  return useQuery({
    queryKey: receptionistsQueryKey,
    queryFn: listReceptionists,
  });
}

/**
 * Create a receptionist scoped to the signed-in doctor.
 *
 * On success, toasts and returns the created {@link ReceptionistResponse}, and
 * invalidates the receptionists list so the new entry is fetched.
 */
export function useCreateReceptionist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ReceptionistRequest) => createReceptionist(req),
    onSuccess: (receptionist) => {
      toast.success("منشی با موفقیت ساخته شد.", {
        description: `${receptionist.first_name} ${receptionist.last_name}`,
      });
      qc.invalidateQueries({ queryKey: receptionistsQueryKey });
    },
    onError: (err: unknown) => {
      toast.error("ساخت منشی ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}
