/**
 * React Query hooks for admin leave management.
 *
 * Query keys follow the `<domain>Keys` factory pattern (see
 * [`useAdminDoctors.ts`](src/hooks/useAdminDoctors.ts)). Mutations invalidate the
 * appropriate cache slices and surface success/error toasts via sonner.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { createLeave, deleteLeave, listLeaves } from "@/lib/schedule-api";
import type { LeaveRequest } from "@/types/schedule";

/** Root namespace + factory for all leave query keys. */
export const leaveKeys = {
  all: ["leaves"] as const,
  lists: () => [...leaveKeys.all, "list"] as const,
  list: (doctorId?: string) => [...leaveKeys.lists(), { doctorId }] as const,
  details: () => [...leaveKeys.all, "detail"] as const,
  detail: (id: string) => [...leaveKeys.details(), id] as const,
};

/** Fetch leaves, optionally filtered by doctor. */
export function useLeaves(doctorId?: string) {
  return useQuery({
    queryKey: leaveKeys.list(doctorId),
    queryFn: () => listLeaves(doctorId),
  });
}

/** Create a new leave. Invalidates the list cache on success. */
export function useCreateLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: LeaveRequest) => createLeave(req),
    onSuccess: () => {
      toast.success("Leave created.");
      void queryClient.invalidateQueries({ queryKey: leaveKeys.lists() });
    },
    onError: (err: unknown) => {
      toast.error("Failed to create leave.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Delete a leave. Invalidates the list cache on success. */
export function useDeleteLeave() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteLeave(id),
    onSuccess: () => {
      toast.success("Leave deleted.");
      void queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    },
    onError: (err: unknown) => {
      toast.error("Failed to delete leave.", {
        description: (err as Error)?.message,
      });
    },
  });
}
