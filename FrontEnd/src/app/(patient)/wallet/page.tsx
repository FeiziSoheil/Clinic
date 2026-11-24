"use client";

/**
 * Patient wallet page.
 *
 * Route: `/wallet`.
 *
 * The balance and transaction history are wired to {@link useWalletBalance}
 * and {@link useWalletTransactions} (currently mock-backed until the backend
 * wallet-read endpoints land). The Top-Up flow hits the REAL backend
 * (`POST /v1/finance/mock-pay`) and then redirects to the mock gateway at
 * `/mock-gateway` to verify the payment.
 */

import { useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  Plus,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PaymentSimulatorDialog } from "@/components/payment/PaymentSimulatorDialog";
import {
  financeKeys,
  useWalletBalance,
  useWalletTransactions,
} from "@/hooks/useFinance";
import { formatJalaliDateTime } from "@/lib/jalali";
import { formatToman } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";
import type {
  TransactionStatus,
  TransactionType,
  WalletTransaction,
} from "@/types/finance";

/** Persian labels for each transaction type. */
const TRANSACTION_TYPE_LABEL: Record<TransactionType, string> = {
  deposit: "شارژ",
  withdraw: "برداشت",
  payment: "پرداخت",
  refund: "بازگشت وجه",
  earning: "درآمد",
  penalty: "جریمه",
};

/** Persian labels for each transaction status. */
const TRANSACTION_STATUS_LABEL: Record<TransactionStatus, string> = {
  pending: "در انتظار",
  completed: "موفق",
  failed: "ناموفق",
};

/** Transaction types that represent money flowing INTO the wallet. */
const INCOME_TYPES: TransactionType[] = ["deposit", "refund", "earning"];

/** Whether a transaction is an income (positive) movement. */
function isIncome(type: TransactionType): boolean {
  return INCOME_TYPES.includes(type);
}

/** Format an ISO timestamp as a short Jalali date + time. */
function formatTxDate(iso: string): string {
  try {
    return formatJalaliDateTime(iso);
  } catch {
    return iso;
  }
}

export default function WalletPage() {
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [amount, setAmount] = useState("");
  /** Whether the Payment Service Simulator dialog is open for a top-up. */
  const [topUpOpen, setTopUpOpen] = useState(false);

  const balanceQuery = useWalletBalance();
  const transactionsQuery = useWalletTransactions();

  const balance = balanceQuery.data?.balance ?? 0;
  const transactions = transactionsQuery.data ?? [];

  const numericAmount = Number(amount);
  const isValidAmount =
    amount !== "" && Number.isFinite(numericAmount) && numericAmount > 0;

  /**
   * Validate the entered amount and open the Payment Service Simulator, which
   * drives the real mock-pay → mock-verify top-up flow (crediting the wallet).
   */
  function handleTopUp() {
    if (!isValidAmount) {
      toast.error("مبلغ معتبر و بزرگ‌تر از صفر وارد کنید.");
      return;
    }

    if (!user?.id) {
      toast.error("ابتدا باید وارد حساب خود شوید.");
      return;
    }

    setTopUpOpen(true);
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold md:text-2xl">کیف پول من</h1>
        <p className="text-sm text-muted-foreground">
          موجودی خود را مدیریت و تراکنش‌ها را مشاهده کنید.
        </p>
      </div>

      {/* Balance card */}
      <Card>
        <CardHeader>
          <CardDescription>موجودی فعلی</CardDescription>
          {balanceQuery.isLoading ? (
            <Skeleton className="h-9 w-40" />
          ) : balanceQuery.isError ? (
            <p className="text-sm text-destructive">
              دریافت موجودی با خطا مواجه شد.
            </p>
          ) : (
            <CardTitle className="flex items-center gap-2 text-2xl md:gap-3 md:text-3xl">
              <Wallet className="size-6 shrink-0 text-primary md:size-7" />
              <span className="break-words">{formatToman(balance)}</span>
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">
            موجودی کیف پول شما برای پرداخت هزینهٔ ویزیت و تسویه نوبت‌ها استفاده
            می‌شود.
          </p>
        </CardContent>
      </Card>

      {/* Top-up card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Plus className="size-4" />
            شارژ کیف پول
          </CardTitle>
          <CardDescription>
            از طریق درگاه پرداخت امن، به کیف پول خود موجودی اضافه کنید.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center">
          <Input
            type="number"
            min={0}
            inputMode="numeric"
            placeholder="مبلغ (تومان)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={topUpOpen}
            className="min-h-11 sm:max-w-xs"
          />
          <Button
            onClick={handleTopUp}
            disabled={topUpOpen || !isValidAmount}
            className="min-h-11 w-full sm:w-auto"
          >
            <Plus className="size-4" />
            شارژ
          </Button>
        </CardContent>
      </Card>

      {/* Transactions card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4" />
            تراکنش‌ها
          </CardTitle>
          <CardDescription>
            واریزها و پرداخت‌های شما در اینجا نمایش داده می‌شوند.
          </CardDescription>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          {transactionsQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : transactionsQuery.isError ? (
            <p className="py-8 text-center text-sm text-destructive">
              دریافت تراکنش‌ها با خطا مواجه شد.
            </p>
          ) : transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              هنوز تراکنشی ثبت نشده است.
            </p>
          ) : (
            <>
              {/* Mobile: stacked rows avoid horizontal scroll */}
              <ul className="flex flex-col divide-y md:hidden">
                {transactions.map((txn) => (
                  <TransactionListItem key={txn.id} txn={txn} />
                ))}
              </ul>

              {/* md+: table layout */}
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>تاریخ</TableHead>
                      <TableHead>نوع</TableHead>
                      <TableHead>توضیحات</TableHead>
                      <TableHead className="text-end">مبلغ</TableHead>
                      <TableHead>وضعیت</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((txn) => (
                      <TransactionRow key={txn.id} txn={txn} />
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment Service Simulator — drives the real top-up flow. */}
      <PaymentSimulatorDialog
        open={topUpOpen}
        onOpenChange={setTopUpOpen}
        amount={numericAmount}
        mode="topup"
        onSuccess={() => {
          setTopUpOpen(false);
          setAmount("");
          // Invalidate finance cache so the updated balance & new transaction
          // refetch immediately instead of waiting for a manual page refresh.
          void queryClient.invalidateQueries({ queryKey: financeKeys.all });
        }}
      />
    </div>
  );
}

/** Shared amount/status presentation for wallet transactions. */
function getTransactionPresentation(txn: WalletTransaction) {
  const income = isIncome(txn.type);
  const signedAmount = income ? txn.amount : -txn.amount;
  const statusVariant =
    txn.status === "completed"
      ? ("default" as const)
      : txn.status === "pending"
        ? ("secondary" as const)
        : ("destructive" as const);

  return { income, signedAmount, statusVariant };
}

/** Mobile stacked transaction row (no horizontal scroll). */
function TransactionListItem({ txn }: { txn: WalletTransaction }) {
  const { income, signedAmount, statusVariant } =
    getTransactionPresentation(txn);

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex flex-col gap-1">
          <Badge variant="secondary" className="w-fit">
            <span className="flex items-center gap-1">
              {income ? (
                <ArrowDownCircle className="size-3.5 text-emerald-500" />
              ) : (
                <ArrowUpCircle className="size-3.5 text-red-500" />
              )}
              {TRANSACTION_TYPE_LABEL[txn.type]}
            </span>
          </Badge>
          <p className="text-sm break-words">{txn.description || "—"}</p>
          <p className="text-xs text-muted-foreground">
            {formatTxDate(txn.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span
            className={
              income
                ? "text-sm font-medium text-emerald-600 dark:text-emerald-400"
                : "text-sm font-medium text-red-600 dark:text-red-400"
            }
          >
            {income ? "+" : "−"}
            {formatToman(Math.abs(signedAmount))}
          </span>
          <Badge variant={statusVariant}>
            {TRANSACTION_STATUS_LABEL[txn.status]}
          </Badge>
        </div>
      </div>
    </li>
  );
}

/** A single transaction row with color-coded amount and status badge. */
function TransactionRow({ txn }: { txn: WalletTransaction }) {
  const { income, signedAmount, statusVariant } =
    getTransactionPresentation(txn);

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
        {formatTxDate(txn.created_at)}
      </TableCell>
      <TableCell>
        <Badge variant="secondary">
          <span className="flex items-center gap-1">
            {income ? (
              <ArrowDownCircle className="size-3.5 text-emerald-500" />
            ) : (
              <ArrowUpCircle className="size-3.5 text-red-500" />
            )}
            {TRANSACTION_TYPE_LABEL[txn.type]}
          </span>
        </Badge>
      </TableCell>
      <TableCell className="max-w-[12rem] truncate text-sm">
        {txn.description || "—"}
      </TableCell>
      <TableCell
        className={
          income
            ? "whitespace-nowrap text-end font-medium text-emerald-600 dark:text-emerald-400"
            : "whitespace-nowrap text-end font-medium text-red-600 dark:text-red-400"
        }
      >
        {income ? "+" : "−"}
        {formatToman(Math.abs(signedAmount))}
      </TableCell>
      <TableCell>
        <Badge variant={statusVariant}>
          {TRANSACTION_STATUS_LABEL[txn.status]}
        </Badge>
      </TableCell>
    </TableRow>
  );
}
