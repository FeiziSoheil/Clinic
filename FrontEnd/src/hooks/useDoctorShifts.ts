/**
 * React Query hooks for the signed-in doctor's own shifts.
 *
 * Query keys follow the `<domain>Keys` factory pattern (see
 * [`useLeaves.ts`](src/hooks/useLeaves.ts)). Mutations invalidate the
 * appropriate cache slices and surface success/error toasts via sonner.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

import {
  createRecurringShifts,
  createShift,
  deleteShift,
  listMyShifts,
  updateShift,
} from "@/lib/doctor-shift-api";
import {
  createTimeBlock,
  deleteTimeBlock,
  fetchTimeBlocks,
} from "@/lib/schedule-api";
import type {
  CreateTimeBlockRequest,
  RecurringShiftRequest,
  ShiftRequest,
} from "@/types/schedule";

/** Prefer a clear Persian description over raw Axios / debug strings. */
function mutationErrorDescription(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string; debug?: unknown }
      | undefined;
    const debug = typeof data?.debug === "string" ? data.debug : "";
    if (err.response?.status === 409) {
      if (debug.includes("overlaps")) {
        return "این بازه با شیفت دیگری در همین روز تداخل دارد.";
      }
      if (debug.includes("leave")) {
        return "پزشک در این تاریخ مرخصی دارد.";
      }
      return "این بازه با شیفت دیگری تداخل دارد.";
    }
    if (debug.trim()) return debug;
    if (typeof data?.message === "string" && data.message.trim()) {
      return data.message;
    }
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Root namespace + factory for all doctor-shift query keys. */
export const doctorShiftKeys = {
  all: ["doctor-shifts"] as const,
  lists: () => [...doctorShiftKeys.all, "list"] as const,
  list: (doctorId: string, date?: string) =>
    [...doctorShiftKeys.lists(), { doctorId, date }] as const,
  details: () => [...doctorShiftKeys.all, "detail"] as const,
  detail: (id: string) => [...doctorShiftKeys.details(), id] as const,
};

/** Root namespace + factory for all time-block query keys. */
export const timeBlockKeys = {
  all: ["schedule", "time-blocks"] as const,
  lists: () => [...timeBlockKeys.all, "list"] as const,
  list: (doctorId: string, date?: string) =>
    [...timeBlockKeys.lists(), doctorId, date ?? "all"] as const,
};

/**
 * Fetch the signed-in doctor's shifts.
 *
 * The query is disabled until a `doctorId` is provided.
 *
 * @param doctorId Hex id of the signed-in doctor (from the auth store).
 * @param date     Optional `"YYYY-MM-DD"` filter.
 */
export function useDoctorShifts(doctorId: string | undefined, date?: string) {
  return useQuery({
    queryKey: doctorShiftKeys.list(doctorId ?? "", date),
    queryFn: () => listMyShifts(doctorId as string, date),
    enabled: Boolean(doctorId),
  });
}

/** Create a single shift. Invalidates the list cache on success. */
export function useCreateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: ShiftRequest) => createShift(req),
    onSuccess: () => {
      toast.success("شیفت با موفقیت ثبت شد.");
      void queryClient.invalidateQueries({ queryKey: doctorShiftKeys.lists() });
    },
    onError: (err: unknown) => {
      toast.error("ثبت شیفت ناموفق بود.", {
        description: mutationErrorDescription(err, "لطفاً دوباره تلاش کنید."),
      });
    },
  });
}

/** Create recurring shifts. Invalidates the list cache on success. */
export function useCreateRecurringShifts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: RecurringShiftRequest) => createRecurringShifts(req),
    onSuccess: () => {
      toast.success("شیفت‌های تکرارشونده ثبت شدند.");
      void queryClient.invalidateQueries({ queryKey: doctorShiftKeys.lists() });
    },
    onError: (err: unknown) => {
      toast.error("ثبت شیفت‌های تکرارشونده ناموفق بود.", {
        description: mutationErrorDescription(err, "لطفاً دوباره تلاش کنید."),
      });
    },
  });
}

/** Delete a shift. Invalidates the list cache on success. */
export function useDeleteShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteShift(id),
    onSuccess: () => {
      toast.success("شیفت حذف شد.");
      void queryClient.invalidateQueries({ queryKey: doctorShiftKeys.all });
    },
    onError: (err: unknown) => {
      toast.error("حذف شیفت ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/**
 * Update a shift's mutable fields (toggle active / adjust capacity).
 *
 * Invalidates the shift list cache on success. When toggling `is_active`, the
 * success toast reflects the resulting state ("شیفت فعال شد" / "شیفت غیرفعال
 * شد"); other updates fall back to a generic message.
 */
export function useUpdateShift() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      shiftId,
      data,
    }: {
      shiftId: string;
      data: { is_active?: boolean; max_patients?: number };
    }) => updateShift(shiftId, data),
    onSuccess: (_data, variables) => {
      if (typeof variables.data.is_active === "boolean") {
        toast.success(
          variables.data.is_active ? "شیفت فعال شد." : "شیفت غیرفعال شد.",
        );
      } else {
        toast.success("شیفت به‌روزرسانی شد.");
      }
      void queryClient.invalidateQueries({ queryKey: doctorShiftKeys.lists() });
    },
    onError: (err: unknown) => {
      toast.error("به‌روزرسانی شیفت ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/* -------------------------------------------------------------------------- */
/*  Time blocks                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Fetch a doctor's time blocks, optionally narrowed to a date.
 *
 * Disabled until `doctorId` is provided.
 */
export function useTimeBlocks(doctorId: string | undefined, date?: string) {
  return useQuery({
    queryKey: timeBlockKeys.list(doctorId ?? "", date),
    queryFn: () => fetchTimeBlocks(doctorId as string, date),
    enabled: Boolean(doctorId),
  });
}

/** Create a time block. Invalidates the time-block list cache on success. */
export function useCreateTimeBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateTimeBlockRequest) => createTimeBlock(req),
    onSuccess: () => {
      toast.success("بازه زمانی ایجاد شد.");
      void queryClient.invalidateQueries({ queryKey: timeBlockKeys.lists() });
    },
    onError: (err: unknown) => {
      toast.error("ایجاد بازه زمانی ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/** Delete a time block. Invalidates the time-block cache on success. */
export function useDeleteTimeBlock() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTimeBlock(id),
    onSuccess: () => {
      toast.success("بازه زمانی حذف شد.");
      void queryClient.invalidateQueries({ queryKey: timeBlockKeys.all });
    },
    onError: (err: unknown) => {
      toast.error("حذف بازه زمانی ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}
