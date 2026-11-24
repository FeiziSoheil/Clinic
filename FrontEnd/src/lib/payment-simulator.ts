/**
 * Payment Service Simulator.
 *
 * This module orchestrates the FULL real payment lifecycle for a patient's
 * appointment against the real backend finance endpoints. The external payment
 * gateway is unavailable, so the backend's mock-payment endpoints
 * (`/v1/finance/mock-pay` → `/v1/finance/mock-verify`) are treated as a real
 * gateway and chained together to present a complete, realistic payment
 * experience.
 *
 * Every function here delegates to the existing API helpers in
 * [`finance-api.ts`](./finance-api.ts) and [`booking-api.ts`](./booking-api.ts)
 * — there is no duplicated HTTP logic. The simulator only adds orchestration
 * (initiate → verify, balance-gated full visit-fee payment, settle/cancel) and
 * friendly error wrapping.
 */

import { payVisitFee as payVisitFeeApi } from "@/lib/booking-api";
import {
  cancelPayment,
  getWalletBalance,
  initiateMockPayment,
  settlePayment,
  verifyMockPayment,
} from "@/lib/finance-api";
import { useAuthStore } from "@/store/authStore";
import type {
  InvoiceResponse,
  TransactionResponse,
} from "@/types/finance";

/**
 * Ordered lifecycle stages a simulated payment moves through.
 *
 * Exported for UI consumption — the [`PaymentSimulatorDialog`](../components/payment/PaymentSimulatorDialog.tsx)
 * renders these as a stepper. Each entry maps to a `PaymentStepLabel` so the
 * dialog can show a human-friendly Persian label per stage.
 */
export const PAYMENT_STEPS = [
  "INITIATING",
  "AWAITING_VERIFY",
  "VERIFIED",
  "DEPOSIT_PAID",
  "SETTLED",
] as const;

/** A single stage in the payment lifecycle. */
export type PaymentStep = (typeof PAYMENT_STEPS)[number];

/**
 * Persian labels for each {@link PaymentStep}, keyed by stage.
 *
 * Kept here (next to the data it describes) so the dialog and any future
 * consumer share one source of truth.
 */
export const PAYMENT_STEP_LABELS: Record<PaymentStep, string> = {
  INITIATING: "شروع تراکنش",
  AWAITING_VERIFY: "در انتظار تأیید درگاه",
  VERIFIED: "تأیید پرداخت",
  DEPOSIT_PAID: "پرداخت هزینه ویزیت",
  SETTLED: "تسویه نهایی",
};

/** Resolve after `ms` — gives the simulator a realistic, visible cadence. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Coerce an unknown error into a readable `Error`, prefixing it with `prefix`.
 *
 * Axios rejections carry `response.data.message`; we surface that when present
 * so the user sees the backend's own wording (e.g. "insufficient balance").
 */
function wrapError(prefix: string, err: unknown): Error {
  const axiosMsg =
    (err as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ?? (err as Error)?.message;
  return new Error(axiosMsg ? `${prefix}: ${axiosMsg}` : prefix);
}

/**
 * Detect an "insufficient balance" rejection from the deposit endpoint.
 *
 * The backend surfaces `ErrInsufficientBalance`; defensively we also check the
 * Axios response body and the lowercased message string.
 */
function isInsufficientBalance(err: unknown): boolean {
  const msg =
    (err as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (err as Error)?.message ??
    "";
  return /insufficient|balance|موجودی/i.test(msg);
}

/**
 * Resolve the authenticated patient's user id.
 *
 * Throws a clear error when no session exists — callers should never reach the
 * finance endpoints without a JWT.
 */
function requireUserId(): string {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    throw new Error("برای انجام پرداخت ابتدا باید وارد حساب خود شوید.");
  }
  return userId;
}

/**
 * Simulate a wallet top-up through the mock payment gateway.
 *
 * Backed by the real endpoints `POST /api/v1/finance/mock-pay` followed
 * immediately by `GET /api/v1/finance/mock-verify?code=<tracking_code>`. The
 * verify call is what actually credits the patient's wallet, so this function
 * waits for it (with a small, realistic delay) and returns the resulting
 * deposit {@link TransactionResponse}.
 *
 * @param amount Positive amount in Toman to top up.
 * @returns The wallet deposit transaction created on verification.
 * @throws  When initiation or verification fails (wrapped with a clear message).
 */
export async function simulateWalletTopUp(
  amount: number,
): Promise<TransactionResponse> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("مبلغ شارژ باید بزرگ‌تر از صفر باشد.");
  }

  const userId = requireUserId();

  // 1 — Initiate the mock payment (gateway "redirect").
  const attempt = await initiateMockPayment({
    user_id: userId,
    amount,
  }).catch((err) => {
    throw wrapError("شروع پرداخت ناموفق بود", err);
  });

  // 2 — Verify it. A short delay makes the simulated gateway feel real and
  //     guarantees the backend has flushed the pending attempt.
  await delay(700);
  const transaction = await verifyMockPayment(
    attempt.tracking_code,
  ).catch((err) => {
    throw wrapError("تأیید پرداخت در درگاه ناموفق بود", err);
  });

  return transaction;
}

/**
 * Pay the FULL visit fee for an appointment in a single up-front payment,
 * auto-topping-up the wallet first if it lacks the funds.
 *
 * Backed by the real endpoint `POST /api/v1/finance/pay`. The deposit /
 * prepayment mechanism has been removed, so the entire visit fee is collected
 * at once. The backend rejects the payment when the patient's wallet balance is
 * below the full visit fee. Rather than failing silently, this function:
 *   - When `feeAmount` is known, proactively tops the wallet up by exactly
 *     that amount (via {@link simulateWalletTopUp}) when the current balance is
 *     insufficient, then pays the fee.
 *   - When `feeAmount` is unknown, attempts the payment directly and, on an
 *     insufficient-balance rejection, rethrows a clear, actionable error
 *     (auto-top-up is impossible without the exact amount).
 *
 * @param appointmentId  Hex ObjectID of the appointment to pay the visit fee for.
 * @param feeAmount      Optional exact visit-fee amount (Toman). Pass it whenever
 *                       the caller knows the visit fee so the auto-top-up can
 *                       fund the wallet precisely.
 * @returns The created/partial {@link InvoiceResponse} (`status:"PARTIAL"`).
 * @throws  When the payment (and any auto top-up) fails.
 */
export async function payVisitFee(
  appointmentId: string,
  feeAmount?: number,
): Promise<InvoiceResponse> {
  if (!appointmentId) {
    throw new Error("شناسه نوبت برای پرداخت هزینه ویزیت الزامی است.");
  }

  // Proactive balance gate — only possible when the exact fee is known.
  if (feeAmount !== undefined && feeAmount > 0) {
    try {
      const wallet = await getWalletBalance();
      if (wallet.balance < feeAmount) {
        await simulateWalletTopUp(feeAmount);
      }
    } catch (err) {
      // A wallet-read / top-up hiccup should not abort the attempt outright;
      // fall through and let the real payment endpoint be the source of truth.
      // If the wallet genuinely lacks funds, the payment will reject below.
      if (isInsufficientBalance(err)) throw err;
    }
  }

  // Attempt the payment.
  try {
    return await payVisitFeeApi({ appointment_id: appointmentId });
  } catch (err) {
    if (!isInsufficientBalance(err)) {
      throw wrapError("پرداخت هزینه ویزیت ناموفق بود", err);
    }

    // Insufficient balance and we know the exact amount → fund + retry once.
    if (feeAmount !== undefined && feeAmount > 0) {
      await simulateWalletTopUp(feeAmount).catch((topUpErr) => {
        throw wrapError("شارژ خودکار کیف پول ناموفق بود", topUpErr);
      });
      return await payVisitFeeApi({ appointment_id: appointmentId }).catch(
        (retryErr) => {
          throw wrapError("پرداخت هزینه ویزیت پس از شارژ ناموفق بود", retryErr);
        },
      );
    }

    // No amount known — surface a clear, actionable error to the caller.
    throw wrapError(
      "موجودی کیف پول کافی نیست؛ مبلغ ویزیت مشخص نیست تا شارژ خودکار انجام شود",
      err,
    );
  }
}

/**
 * Settle an appointment's remaining balance and credit the doctor.
 *
 * Backed by the real endpoint `POST /api/v1/finance/settle`. This is the call
 * that drives doctor revenue — it credits the full visit fee to the doctor and
 * flips the invoice to `status:"SETTLED"`.
 *
 * @param appointmentId Hex ObjectID of the appointment to settle.
 * @returns The settled {@link InvoiceResponse}.
 * @throws  When settlement fails (wrapped with a clear message).
 */
export async function settleAppointment(
  appointmentId: string,
): Promise<InvoiceResponse> {
  if (!appointmentId) {
    throw new Error("شناسه نوبت برای تسویه الزامی است.");
  }

  return await settlePayment({ appointment_id: appointmentId }).catch((err) => {
    throw wrapError("تسویه نوبت ناموفق بود", err);
  });
}

/**
 * Process a payment cancellation (refund or forfeit) for an appointment.
 *
 * Backed by the real endpoint `POST /api/v1/finance/cancel`. When
 * `isLateOrNoShow` is `true` the deposit is forfeited
 * (`status:"FORFEITED"`); otherwise it is refunded to the patient's wallet.
 *
 * @param appointmentId  Hex ObjectID of the appointment to cancel the payment for.
 * @param isLateOrNoShow Whether the cancellation is within the no-refund window.
 * @returns The updated {@link InvoiceResponse}.
 * @throws  When cancellation fails (wrapped with a clear message).
 */
export async function cancelAppointmentPayment(
  appointmentId: string,
  isLateOrNoShow: boolean,
): Promise<InvoiceResponse> {
  if (!appointmentId) {
    throw new Error("شناسه نوبت برای کنسلی الزامی است.");
  }

  return await cancelPayment({
    appointment_id: appointmentId,
    is_late_or_no_show: isLateOrNoShow,
  }).catch((err) => {
    throw wrapError("کنسلی پرداخت ناموفق بود", err);
  });
}
