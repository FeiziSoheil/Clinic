/**
 * React Query mutations & queries for the finance flow.
 *
 * Mutations invalidate the shared finance cache on success so any open
 * wallet/transaction views refetch automatically.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelPayment,
  getWalletBalance,
  getWalletTransactions,
  initiateMockPayment,
  settlePayment,
  verifyMockPayment,
} from "@/lib/finance-api";
import { doctorPortalKeys } from "@/hooks/useDoctorPortal";
import type {
  CancelPaymentRequest,
  InitiateMockPaymentRequest,
  SettleRequest,
} from "@/types/finance";

/**
 * Namespaced query-key factory for finance-related queries.
 *
 * `all` invalidates everything finance-related, `walletBalance` /
 * `walletTransactions` scope the cache to the read endpoints.
 */
export const financeKeys = {
  all: ["finance"] as const,
  walletBalance: ["finance", "wallet"] as const,
  walletTransactions: ["finance", "wallet", "transactions"] as const,
};

/**
 * Fetch the authenticated user's wallet balance.
 *
 * Callers receive `data`, `isLoading`, `error`, etc.
 */
export function useWalletBalance() {
  return useQuery({
    queryKey: financeKeys.walletBalance,
    queryFn: () => getWalletBalance(),
  });
}

/**
 * Fetch the authenticated user's wallet transaction history.
 *
 * Callers receive `data`, `isLoading`, `error`, etc.
 */
export function useWalletTransactions() {
  return useQuery({
    queryKey: financeKeys.walletTransactions,
    queryFn: () => getWalletTransactions(),
  });
}

/**
 * Initiate a mock top-up payment.
 *
 * Callers receive `mutate`/`mutateAsync`, `isPending`, `data`, `error`, etc.
 */
export function useInitiateMockPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: InitiateMockPaymentRequest) => initiateMockPayment(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

/**
 * Verify a mock payment using its tracking code (called from the mock gateway).
 */
export function useVerifyMockPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (trackingCode: string) => verifyMockPayment(trackingCode),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
    },
  });
}

/**
 * Settle an appointment's remaining payment.
 *
 * Invalidates the finance cache on success so wallet/balance views refetch.
 */
export function useSettlePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: SettleRequest) => settlePayment(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      // Keep the reception/doctor queue in sync after a settle.
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
    },
  });
}

/**
 * Process a cancellation refund / penalty for an appointment.
 *
 * Invalidates the finance cache on success so wallet/balance views refetch.
 */
export function useCancelPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (req: CancelPaymentRequest) => cancelPayment(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: financeKeys.all });
      // Keep the reception/doctor queue in sync after a cancel.
      void queryClient.invalidateQueries({ queryKey: doctorPortalKeys.all });
    },
  });
}
