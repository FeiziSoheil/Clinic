/**
 * React Query mutation hooks for the payment simulator.
 *
 * Each hook wraps one [`payment-simulator`](../lib/payment-simulator.ts)
 * function and keeps the shared cache in sync on success:
 *   - finance keys (wallet balance / transactions) are always invalidated
 *     because top-ups, visit-fee payments and settlements all move money.
 *   - booking keys are invalidated for the appointment-mutating operations
 *     (visit-fee payment, settle, cancel) so appointment lists/queues refetch.
 *
 * Success and failure are announced via `sonner` toasts in Persian.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  cancelAppointmentPayment,
  payVisitFee,
  settleAppointment,
  simulateWalletTopUp,
} from "@/lib/payment-simulator";
import { bookingKeys } from "@/hooks/useBooking";
import { financeKeys } from "@/hooks/useFinance";

/**
 * Namespaced query-key factory for payment-simulator results.
 *
 * Payment operations don't own a dedicated *query* yet, but the factory mirrors
 * the `financeKeys` / `bookingKeys` pattern so consumers can target specific
 * results (e.g. a future invoice cache) without hand-rolled string keys.
 */
export const paymentKeys = {
  all: ["payments"] as const,
  detail: (appointmentId: string) => ["payments", appointmentId] as const,
};

/**
 * Top up the authenticated patient's wallet via the mock gateway.
 *
 * Invalidates finance keys on success so the wallet balance / transaction
 * history refetch.
 */
export function useTopUpWallet() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (amount: number) => simulateWalletTopUp(amount),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success("کیف پول با موفقیت شارژ شد.");
    },
    onError: (err: unknown) => {
      toast.error("شارژ کیف پول ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/**
 * Pay an appointment's full visit fee (auto-top-up aware).
 *
 * Invalidates both booking and finance keys on success so appointment lists and
 * the wallet view stay consistent.
 */
export function usePayVisitFeeSim() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: { appointmentId: string; feeAmount?: number }) =>
      payVisitFee(args.appointmentId, args.feeAmount),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success("هزینه ویزیت با موفقیت پرداخت شد.");
    },
    onError: (err: unknown) => {
      toast.error("پرداخت هزینه ویزیت ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/**
 * Settle an appointment's remaining balance (drives doctor revenue).
 *
 * Invalidates booking + finance keys on success.
 */
export function useSettleAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (appointmentId: string) => settleAppointment(appointmentId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success("تسویه نهایی با موفقیت انجام شد.");
    },
    onError: (err: unknown) => {
      toast.error("تسویه نوبت ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}

/**
 * Process a payment cancellation (refund or forfeit).
 *
 * Invalidates booking + finance keys on success.
 */
export function useCancelAppointmentPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (args: {
      appointmentId: string;
      isLateOrNoShow: boolean;
    }) => cancelAppointmentPayment(args.appointmentId, args.isLateOrNoShow),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: bookingKeys.all });
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      toast.success("کنسلی پرداخت ثبت شد.");
    },
    onError: (err: unknown) => {
      toast.error("کنسلی پرداخت ناموفق بود.", {
        description: (err as Error)?.message,
      });
    },
  });
}
