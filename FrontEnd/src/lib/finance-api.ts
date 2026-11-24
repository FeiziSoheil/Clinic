/**
 * Finance operations.
 *
 * The real backend endpoints (`mock-pay`, `mock-verify`, `settle`, `cancel`)
 * already exist, so those calls hit the API by default. A {@link USE_MOCK}
 * flag governs the wallet-read endpoints (`wallet`, `wallet/transactions`)
 * which do NOT exist on the backend yet — those return mock data until the
 * endpoints land.
 */

import { apiClient } from "./api";
import type {
  CancelPaymentRequest,
  InitiateMockPaymentRequest,
  InvoiceResponse,
  PaymentAttemptResponse,
  SettleRequest,
  TransactionResponse,
  WalletResponse,
  WalletTransaction,
} from "@/types/finance";

/**
 * Master switch for the finance mock layer. Wallet reads are mock-only until
 * the backend implements `GET /v1/finance/wallet` and
 * `GET /v1/finance/wallet/transactions`. Keep `false` in normal operation so
 * settle/cancel/mock-pay/mock-verify hit the real API.
 */
export const USE_MOCK = false;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Initiate a mock top-up payment.
 *
 * Real endpoint: `POST /api/v1/finance/mock-pay` → `201`.
 *
 * Returns the created payment attempt (status `PENDING`) whose `tracking_code`
 * is later used to verify the payment on the mock gateway.
 */
export async function initiateMockPayment(
  req: InitiateMockPaymentRequest,
): Promise<PaymentAttemptResponse> {
  const res = await apiClient.post<PaymentAttemptResponse>(
    "/v1/finance/mock-pay",
    req,
  );
  return res.data;
}

/**
 * Verify a mock payment using its tracking code.
 *
 * Real endpoint: `GET /api/v1/finance/mock-verify?code=<tracking_code>` → `200`.
 *
 * Returns the wallet transaction created from the verified attempt. Errors:
 * empty code → 400, attempt not found → 404, already verified → 409.
 */
export async function verifyMockPayment(
  trackingCode: string,
): Promise<TransactionResponse> {
  const res = await apiClient.get<TransactionResponse>(
    "/v1/finance/mock-verify",
    {
      params: { code: trackingCode },
    },
  );
  return res.data;
}

// ---------------------------------------------------------------------------
// Wallet read endpoints.
// ---------------------------------------------------------------------------

/**
 * Fetch the authenticated user's wallet balance.
 *
 * Real endpoint: `GET /api/v1/finance/wallet` → `200`. The backend resolves the
 * wallet owner from the JWT, so this returns the caller's own balance (0 when
 * no wallet exists yet). Currency is always reported as "Toman".
 */
export async function getWalletBalance(): Promise<WalletResponse> {
  if (USE_MOCK) {
    await delay(400);
    return {
      balance: 1_250_000,
      currency: "Toman",
    };
  }

  const res = await apiClient.get<WalletResponse>("/v1/finance/wallet");
  return res.data;
}

/**
 * Fetch the authenticated user's wallet transaction history.
 *
 * // TODO: Backend endpoint not yet implemented — `GET /v1/finance/wallet/transactions`.
 * Returns mock data until the endpoint lands.
 */
export async function getWalletTransactions(): Promise<WalletTransaction[]> {
  // TODO: Backend endpoint not yet implemented — replace mock with:
  //   const res = await apiClient.get<WalletTransaction[]>(
  //     "/v1/finance/wallet/transactions",
  //   );
  //   return res.data;
  if (USE_MOCK) {
    await delay(500);
    const now = Date.now();
    return [
      {
        id: "txn-1",
        type: "deposit",
        amount: 500_000,
        description: "Top-up via mock gateway",
        created_at: new Date(now - 86_400_000).toISOString(),
        status: "completed",
      },
      {
        id: "txn-2",
        type: "payment",
        amount: 150_000,
        description: "Visit fee – Dr. Ahmadi",
        created_at: new Date(now - 3_600_000).toISOString(),
        status: "completed",
      },
      {
        id: "txn-3",
        type: "refund",
        amount: 50_000,
        description: "Cancellation refund",
        created_at: new Date(now - 7_200_000).toISOString(),
        status: "pending",
      },
    ];
  }

  // Stub until the backend endpoint exists.
  // TODO: Backend endpoint not yet implemented.
  await delay(500);
  return [];
}

// ---------------------------------------------------------------------------
// Settle & cancel (real backend endpoints).
// ---------------------------------------------------------------------------

/**
 * Settle an appointment's remaining payment.
 *
 * Real endpoint: `POST /v1/finance/settle`. Returns the settled
 * {@link InvoiceResponse} with the full visit fee credited to the doctor
 * (`doctor_share`, `status:"SETTLED"`). The `USE_MOCK` branch is intentionally
 * omitted — settlement is part of the real integration.
 */
export async function settlePayment(
  req: SettleRequest,
): Promise<InvoiceResponse> {
  const res = await apiClient.post<InvoiceResponse>("/v1/finance/settle", req);
  return res.data;
}

/**
 * Process a cancellation refund / penalty for an appointment.
 *
 * Real endpoint: `POST /v1/finance/cancel`. Returns the updated
 * {@link InvoiceResponse} — `status:"FORFEITED"` when `is_late_or_no_show` is
 * `true` (the collected visit fee is forfeited to the doctor), otherwise the
 * collected visit fee is refunded to the patient's wallet. The `USE_MOCK`
 * branch is intentionally omitted — cancellation is part of the real
 * integration.
 */
export async function cancelPayment(
  req: CancelPaymentRequest,
): Promise<InvoiceResponse> {
  const res = await apiClient.post<InvoiceResponse>("/v1/finance/cancel", req);
  return res.data;
}
