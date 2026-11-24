/**
 * Finance-domain types.
 *
 * These interfaces mirror the Go DTOs returned by the finance service so the
 * frontend types line up with what the API returns. Field names are kept
 * snake_case to match the JSON payload exactly (no client-side transform).
 */

/**
 * Kind of ledger movement recorded against a patient's wallet.
 *
 * Mirrors the `TransactionType` enum on the backend (uppercase Go values).
 * Used by {@link TransactionResponse} returned from `GET /api/v1/finance/mock-verify`.
 */
export type LedgerTransactionType =
  | "DEPOSIT"
  | "WITHDRAWAL"
  | "REFUND"
  | "VISIT_FEE"
  | "DEPOSIT_FORFEIT"
  | "REVENUE_SHARE";

/** Lifecycle of a payment attempt against the mock gateway. */
export type PaymentAttemptStatus = "PENDING" | "SUCCESS" | "FAILED";

/** Lifecycle of a finance invoice. */
export type InvoiceStatus = "PARTIAL" | "SETTLED" | "FORFEITED";

/**
 * A single wallet transaction.
 *
 * Returned by `GET /api/v1/finance/mock-verify`.
 */
export interface TransactionResponse {
  id: string;
  user_id: string;
  amount: number;
  type: LedgerTransactionType;
  /** Free-form reference (e.g. the tracking code of the originating attempt). */
  reference_id: string;
  /** ISO 8601 timestamp. */
  created_at: string;
}

/**
 * A payment attempt created when initiating a mock top-up.
 *
 * Returned by `POST /api/v1/finance/mock-pay`.
 */
export interface PaymentAttemptResponse {
  id: string;
  user_id: string;
  amount: number;
  status: PaymentAttemptStatus;
  tracking_code: string;
  /** Where the patient is redirected to "complete" the mock payment. */
  payment_url?: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  /** ISO 8601 timestamp. */
  updated_at: string;
}

/** Request body for `POST /api/v1/finance/mock-pay`. */
export interface InitiateMockPaymentRequest {
  /** Hex ObjectID of the authenticated user. */
  user_id: string;
  /** Positive amount in Toman. Must be > 0. */
  amount: number;
}

/**
 * Invoice returned by the finance service (re-used in the booking flow).
 *
 * Kept here for completeness; the booking module also declares its own copy.
 */
export interface InvoiceResponse {
  id: string;
  appointment_id: string;
  doctor_id: string;
  user_id: string;
  total_fee: number;
  deposit_paid: number;
  doctor_share: number;
  status: InvoiceStatus;
}

// ---------------------------------------------------------------------------
// Wallet read / settle / cancel types.
//
// NOTE: The wallet-read endpoints below do NOT exist on the backend yet, so
// the matching API functions in `finance-api.ts` are mocked for now. The settle
// & cancel endpoints (`POST /v1/finance/settle`, `POST /v1/finance/cancel`) DO
// exist.
// ---------------------------------------------------------------------------

/**
 * Wallet snapshot returned by `GET /v1/finance/wallet`.
 *
 * `currency` is an ISO 4217-ish code (e.g. `"IRT"` / `"Toman"`).
 */
export interface WalletResponse {
  balance: number;
  currency: string;
}

/**
 * Kind of movement on a wallet transaction (lowercase API contract for the
 * wallet transactions endpoint).
 */
export type TransactionType =
  | "deposit"
  | "withdraw"
  | "payment"
  | "refund"
  | "earning"
  | "penalty";

/** Lifecycle of a wallet transaction. */
export type TransactionStatus = "pending" | "completed" | "failed";

/**
 * A single wallet transaction row.
 *
 * Returned by `GET /v1/finance/wallet/transactions`.
 */
export interface WalletTransaction {
  id: string;
  type: TransactionType;
  amount: number;
  description: string;
  /** ISO 8601 timestamp. */
  created_at: string;
  status: TransactionStatus;
}

/**
 * Request body for `POST /v1/finance/settle`.
 *
 * Mirrors the backend `SettleRequest` DTO whose JSON field is `appointment_id`
 * (validated `required`).
 */
export interface SettleRequest {
  appointment_id: string;
}

/**
 * Request body for `POST /v1/finance/cancel`.
 *
 * Mirrors the backend `CancelRequest` DTO. `is_late_or_no_show` toggles the
 * no-refund window: when `true` the collected visit fee is forfeited to the
 * doctor, otherwise it is refunded to the patient's wallet.
 */
export interface CancelPaymentRequest {
  appointment_id: string;
  is_late_or_no_show: boolean;
}
