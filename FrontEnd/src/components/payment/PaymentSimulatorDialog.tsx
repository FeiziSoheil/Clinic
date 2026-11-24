"use client";

/**
 * Payment Simulator Dialog.
 *
 * Visually walks the patient through the simulated payment lifecycle step by
 * step using the [`PAYMENT_STEPS`](../../lib/payment-simulator.ts) stepper.
 * Depending on `mode` it drives one of two real flows:
 *
 * - `topup`    — a standalone wallet top-up via the mock gateway
 *   ([`simulateWalletTopUp`](../../lib/payment-simulator.ts)).
 * - `visitfee` — pay the FULL appointment visit fee
 *   ([`payVisitFee`](../../lib/payment-simulator.ts)), which auto-tops
 *   the wallet up first when funds are short.
 *
 * Each stage is announced with a short, realistic delay so the simulation
 * feels like a real gateway round-trip. Success fires `onSuccess` + a `sonner`
 * toast; failures are rendered inline. The whole dialog is RTL-friendly to
 * match the Persian/Farsi UI.
 */

import { useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  PAYMENT_STEPS,
  PAYMENT_STEP_LABELS,
  payVisitFee,
  simulateWalletTopUp,
  type PaymentStep,
} from "@/lib/payment-simulator";
import { formatToman } from "@/lib/utils";
import type { InvoiceResponse, TransactionResponse } from "@/types/finance";

export interface PaymentSimulatorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Required in `visitfee` mode — the appointment to pay the visit fee for. */
  appointmentId?: string;
  /** Amount to top up (topup mode) or the exact visit fee (visitfee mode). */
  amount: number;
  /** `visitfee` = pay full visit fee; `topup` = just top up the wallet. */
  mode: "visitfee" | "topup";
  /** Fired with the resulting invoice/transaction on success. */
  onSuccess?: (result: InvoiceResponse | TransactionResponse) => void;
}

/** Resolve after `ms`. */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * The highest step a given mode reaches. The visit-fee flow stops at
 * `DEPOSIT_PAID` (the full fee collected); a plain top-up stops at `VERIFIED`.
 * `SETTLED` is reserved for a future settle mode.
 */
function finalStepFor(mode: "visitfee" | "topup"): PaymentStep {
  return mode === "visitfee" ? "DEPOSIT_PAID" : "VERIFIED";
}

export function PaymentSimulatorDialog({
  open,
  onOpenChange,
  appointmentId,
  amount,
  mode,
  onSuccess,
}: PaymentSimulatorDialogProps) {
  const finalStep = finalStepFor(mode);
  const visibleSteps = PAYMENT_STEPS.slice(
    0,
    PAYMENT_STEPS.indexOf(finalStep) + 1,
  );

  const [currentStep, setCurrentStep] = useState<PaymentStep | null>(null);
  const [completed, setCompleted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  // Reset transient state whenever the dialog is (re)opened. Done during render
  // (not in an effect) using React's recommended "adjusting state when a prop
  // changes" pattern to avoid cascading renders.
  const [prevOpen, setPrevOpen] = useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setCurrentStep(null);
      setCompleted(false);
      setError(null);
      setRunning(false);
    }
  }

  /** Advance to the next step after a short, realistic delay. */
  async function advanceTo(step: PaymentStep, delayMs = 600): Promise<void> {
    setCurrentStep(step);
    await sleep(delayMs);
  }

  /** Run the full simulated flow for the active mode. */
  async function handlePay() {
    if (mode === "visitfee" && !appointmentId) {
      setError("شناسه نوبت برای پرداخت هزینه ویزیت در دسترس نیست.");
      return;
    }

    setError(null);
    setRunning(true);

    try {
      // 1 — Gateway round-trip: initiate.
      await advanceTo("INITIATING", 700);

      // 2 — Awaiting verification at the (mock) gateway.
      await advanceTo("AWAITING_VERIFY", 700);

      if (mode === "topup") {
        const transaction = await simulateWalletTopUp(amount);
        await advanceTo("VERIFIED", 600);
        finish(transaction);
        return;
      }

      // mode === "visitfee": payVisitFee may auto-top-up internally, which
      // itself runs the initiate → verify round-trip. We surface that transition
      // as the VERIFIED stage before the visit fee is applied.
      await advanceTo("VERIFIED", 600);
      const invoice = await payVisitFee(appointmentId!, amount);
      await advanceTo("DEPOSIT_PAID", 700);
      finish(invoice);
    } catch (err) {
      const message = (err as Error)?.message ?? "پرداخت ناموفق بود.";
      setError(message);
      setRunning(false);
      toast.error("پرداخت ناموفق بود.", { description: message });
    }
  }

  /** Mark the flow complete and surface the result. */
  function finish(result: InvoiceResponse | TransactionResponse) {
    setCompleted(true);
    setRunning(false);
    onSuccess?.(result);
    toast.success(
      mode === "visitfee"
        ? "هزینه ویزیت پرداخت شد."
        : "کیف پول شارژ شد.",
    );
  }

  /** Whether a given step is already done (strictly before the current one). */
  function isStepDone(step: PaymentStep): boolean {
    if (completed) return true;
    if (currentStep === null) return false;
    return PAYMENT_STEPS.indexOf(step) < PAYMENT_STEPS.indexOf(currentStep);
  }

  function isStepActive(step: PaymentStep): boolean {
    return !completed && currentStep === step;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {mode === "visitfee" ? "پرداخت هزینه ویزیت" : "شارژ کیف پول"}
          </DialogTitle>
          <DialogDescription>
            {mode === "visitfee"
              ? "هزینهٔ کامل ویزیت از طریق درگاه پرداخت شبیه‌سازی‌شده دریافت می‌شود."
              : "کیف پول شما از طریق درگاه پرداخت شبیه‌سازی‌شده شارژ می‌شود."}
          </DialogDescription>
        </DialogHeader>

        {/* Amount summary */}
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {mode === "visitfee" ? "مبلغ ویزیت" : "مبلغ شارژ"}
          </span>
          <span className="font-bold">{formatToman(amount)}</span>
        </div>

        {/* Stepper */}
        <ol className="space-y-3">
          {visibleSteps.map((step) => {
            const done = isStepDone(step);
            const active = isStepActive(step);
            return (
              <li key={step} className="flex items-center gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center">
                  {done ? (
                    <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
                  ) : active ? (
                    <Loader2 className="size-5 animate-spin text-primary" />
                  ) : (
                    <span className="block size-2.5 rounded-full bg-muted-foreground/30" />
                  )}
                </span>
                <span
                  className={
                    done || active
                      ? "font-medium text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  {PAYMENT_STEP_LABELS[step]}
                </span>
              </li>
            );
          })}
        </ol>

        {/* Inline error */}
        {error && (
          <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p className="font-medium text-destructive">{error}</p>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={running}
          >
            {completed ? "بستن" : "انصراف"}
          </Button>
          {!completed && (
            <Button onClick={handlePay} disabled={running}>
              {running ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  در حال پردازش...
                </>
              ) : (
                <>{mode === "visitfee" ? "پرداخت هزینه ویزیت" : "شارژ کیف پول"}</>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
