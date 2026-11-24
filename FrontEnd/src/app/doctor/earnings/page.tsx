"use client";

/**
 * Doctor — Earnings Dashboard.
 *
 * Route: `/doctor/earnings`.
 *
 * Data from real backend finance endpoints:
 *   - `GET /api/v1/finance/doctor/earnings?from=&to=` → range summary
 *   - `GET /api/v1/finance/doctor/transactions?from=&to=` → earnings ledger
 *   - `GET /api/v1/finance/doctor/wallet` → current balance
 *
 * Cards show settled earnings, settled visit count, and patient-paid amounts
 * still awaiting reception settle for the selected inclusive date window.
 */

import { useMemo, useState } from "react";
import {
  Clock,
  DollarSign,
  Download,
  Loader2,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
  AlertCircle,
  Receipt,
  CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { Label } from "@/components/ui/label";
import { cn, formatToman } from "@/lib/utils";
import { formatJalaliLabel } from "@/lib/jalali";
import {
  useDoctorEarnings,
  useDoctorRevenueTransactions,
  useDoctorWallet,
} from "@/hooks/useDoctorPortal";
import type { TransactionResponse } from "@/types/finance";
import type { DoctorEarningsRange } from "@/types/doctor-portal";

/** Today's Gregorian date as `"YYYY-MM-DD"` (local). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** First day of the current Gregorian month as `"YYYY-MM-DD"`. */
function startOfMonthISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Shift a `"YYYY-MM-DD"` by `delta` days. */
function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setDate(date.getDate() + delta);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Inclusive day count between two `"YYYY-MM-DD"` values. */
function inclusiveDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const a = Date.UTC(fy, (fm ?? 1) - 1, fd ?? 1);
  const b = Date.UTC(ty, (tm ?? 1) - 1, td ?? 1);
  return Math.floor((b - a) / 86_400_000) + 1;
}

/** Previous window of the same length ending the day before `from`. */
function previousRange(range: DoctorEarningsRange): DoctorEarningsRange {
  const days = inclusiveDays(range.from, range.to);
  const prevTo = shiftDay(range.from, -1);
  const prevFrom = shiftDay(prevTo, -(days - 1));
  return { from: prevFrom, to: prevTo };
}

/** Human label for a ledger transaction type. */
const TXN_TYPE_LABELS: Record<string, string> = {
  REVENUE_SHARE: "درآمد ویزیت",
  DEPOSIT_FORFEIT: "جریمهٔ بیعانه",
  DEPOSIT: "شارژ",
  VISIT_FEE: "وجه ویزیت",
  REFUND: "بازگشت وجه",
  WITHDRAWAL: "برداشت",
};

/** One summary stat card. */
function StatCard({
  icon: Icon,
  label,
  value,
  tone,
  footer,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: string;
  footer?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg",
            tone,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-bold leading-none">{value}</p>
          {footer ? <div className="pt-1 text-xs">{footer}</div> : null}
        </div>
      </CardContent>
    </Card>
  );
}

export default function DoctorEarningsPage() {
  const [from, setFrom] = useState(startOfMonthISO);
  const [to, setTo] = useState(todayISO);

  const today = todayISO();
  const todayRange = useMemo<DoctorEarningsRange>(
    () => ({ from: today, to: today }),
    [today],
  );

  const range = useMemo<DoctorEarningsRange>(
    () => ({
      from: from <= to ? from : to,
      to: from <= to ? to : from,
    }),
    [from, to],
  );
  const prev = useMemo(() => previousRange(range), [range]);
  const isTodaySelected = range.from === today && range.to === today;

  const todayEarnings = useDoctorEarnings(todayRange);
  const earnings = useDoctorEarnings(range);
  const txns = useDoctorRevenueTransactions(range);
  const wallet = useDoctorWallet();
  const prevEarnings = useDoctorEarnings(prev);

  const summary = earnings.data;
  const todaySummary = todayEarnings.data;
  const transactions = useMemo(() => txns.data ?? [], [txns.data]);

  const shareDelta = useMemo(() => {
    const cur = summary?.doctor_share;
    const prevShare = prevEarnings.data?.doctor_share;
    if (typeof cur !== "number" || typeof prevShare !== "number") return null;
    if (prevShare === 0) return null;
    const ratio = (cur - prevShare) / prevShare;
    return { diff: cur - prevShare, ratio };
  }, [summary?.doctor_share, prevEarnings.data?.doctor_share]);

  const ledgerTotal = useMemo(
    () => transactions.reduce((sum, t) => sum + t.amount, 0),
    [transactions],
  );

  const isLoading = earnings.isLoading;
  const isError = earnings.isError;
  const rangeInvalid = from > to;

  function applyPreset(nextFrom: string, nextTo: string) {
    setFrom(nextFrom);
    setTo(nextTo);
  }

  function selectToday() {
    applyPreset(today, today);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className="size-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">درآمد</h1>
            <p className="text-sm text-muted-foreground">
              {formatJalaliLabel(range.from, "short")} تا{" "}
              {formatJalaliLabel(range.to, "short")}
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 self-start"
          aria-label="خروجی گزارش"
          onClick={() => toast.info("آماده‌سازی گزارش…")}
        >
          <Download className="size-4" />
          <span className="hidden sm:inline">خروجی گزارش</span>
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <Wallet className="size-4" />
              </span>
              <div>
                <p className="text-xs text-muted-foreground">
                  موجودی فعلی کیف پول
                </p>
                <p className="text-xl font-bold">
                  {wallet.isLoading
                    ? "…"
                    : formatToman(wallet.data?.balance ?? 0)}
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-transparent">
              تومان
            </Badge>
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={selectToday}
          className={cn(
            "flex w-full items-center justify-between rounded-xl p-4 text-start transition-colors ring-1",
            isTodaySelected
              ? "bg-primary/10 ring-primary/30"
              : "bg-card ring-foreground/10 hover:bg-muted/40",
          )}
        >
          <div className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300">
              <CalendarDays className="size-4" />
            </span>
            <div>
              <p className="text-xs text-muted-foreground">درآمد امروز</p>
              <p className="text-xl font-bold">
                {todayEarnings.isLoading
                  ? "…"
                  : formatToman(todaySummary?.doctor_share ?? 0)}
              </p>
              <p className="pt-1 text-xs text-muted-foreground">
                {todayEarnings.isLoading
                  ? "…"
                  : `${todaySummary?.total_completed ?? 0} ویزیت تسویه‌شده`}
                {!todayEarnings.isLoading &&
                (todaySummary?.pending_count ?? 0) > 0
                  ? ` · ${todaySummary?.pending_count} در انتظار`
                  : null}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="border-transparent">
            امروز
          </Badge>
        </button>
      </div>

      <Card className="overflow-visible">
        <CardContent className="space-y-4 overflow-visible p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="earnings-from">از تاریخ</Label>
              <JalaliDatePicker
                id="earnings-from"
                value={from}
                maxDate={to || undefined}
                onChange={(iso) => {
                  setFrom(iso);
                  if (to && iso > to) setTo(iso);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="earnings-to">تا تاریخ</Label>
              <JalaliDatePicker
                id="earnings-to"
                value={to}
                minDate={from || undefined}
                onChange={(iso) => {
                  setTo(iso);
                  if (from && iso < from) setFrom(iso);
                }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={isTodaySelected ? "default" : "secondary"}
              size="sm"
              onClick={selectToday}
            >
              امروز
            </Button>
            <Button
              type="button"
              variant={
                range.from === startOfMonthISO() && range.to === today
                  ? "default"
                  : "secondary"
              }
              size="sm"
              onClick={() => applyPreset(startOfMonthISO(), today)}
            >
              این ماه
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => applyPreset(shiftDay(today, -6), today)}
            >
              ۷ روز اخیر
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => applyPreset(shiftDay(today, -29), today)}
            >
              ۳۰ روز اخیر
            </Button>
          </div>
          {rangeInvalid ? (
            <p className="text-sm text-destructive">
              تاریخ شروع نمی‌تواند بعد از تاریخ پایان باشد.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError || !summary ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">بارگذاری درآمد شما ممکن نشد.</p>
              <p className="text-sm text-muted-foreground">
                {(earnings.error as Error)?.message ?? "لطفاً دوباره تلاش کنید."}
              </p>
            </div>
            <Button variant="outline" onClick={() => earnings.refetch()}>
              تلاش مجدد
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              icon={TrendingUp}
              label="درآمد تسویه‌شده"
              value={formatToman(summary.doctor_share)}
              tone="bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
              footer={
                shareDelta ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 font-medium",
                      shareDelta.ratio >= 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-destructive",
                    )}
                  >
                    {shareDelta.ratio >= 0 ? (
                      <TrendingUp className="size-3.5" />
                    ) : (
                      <TrendingDown className="size-3.5" />
                    )}
                    {shareDelta.ratio >= 0 ? "+" : ""}
                    {Math.round(shareDelta.ratio * 100)}٪ نسبت به بازهٔ قبل
                  </span>
                ) : null
              }
            />
            <StatCard
              icon={Users}
              label="ویزیت‌های تسویه‌شده"
              value={String(summary.total_completed)}
              tone="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
            />
            <StatCard
              icon={Clock}
              label="در انتظار تسویه"
              value={formatToman(summary.pending_settlement)}
              tone="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
              footer={
                summary.pending_count > 0 ? (
                  <span className="text-muted-foreground">
                    {summary.pending_count} نوبت پرداخت‌شده
                  </span>
                ) : (
                  <span className="text-muted-foreground">موردی در صف نیست</span>
                )
              }
            />
          </div>

          <TransactionsSection
            transactions={transactions}
            isLoading={txns.isLoading}
            isError={txns.isError}
            error={txns.error as Error | undefined}
            ledgerTotal={ledgerTotal}
            onRetry={() => txns.refetch()}
          />
        </>
      )}
    </div>
  );
}

function TransactionsSection({
  transactions,
  isLoading,
  isError,
  error,
  ledgerTotal,
  onRetry,
}: {
  transactions: TransactionResponse[];
  isLoading: boolean;
  isError: boolean;
  error?: Error;
  ledgerTotal: number;
  onRetry: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="size-5 text-primary" />
          تراکنش‌های درآمد
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="size-8 text-destructive" />
            <div className="space-y-1">
              <p className="font-medium">بارگذاری تراکنش‌ها ممکن نشد.</p>
              <p className="text-sm text-muted-foreground">
                {error?.message ?? "لطفاً دوباره تلاش کنید."}
              </p>
            </div>
            <Button variant="outline" onClick={onRetry}>
              تلاش مجدد
            </Button>
          </div>
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <Receipt className="size-8 text-muted-foreground" />
            <p className="font-medium">در این بازه تراکنشی وجود ندارد.</p>
            <p className="text-sm text-muted-foreground">
              ویزیت‌های تسویه‌شده در اینجا نمایش داده می‌شوند.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="hidden grid-cols-12 gap-2 px-1 text-xs font-medium text-muted-foreground sm:grid">
              <span className="col-span-3">نوع</span>
              <span className="col-span-4">نوبت</span>
              <span className="col-span-2">تاریخ</span>
              <span className="col-span-3 text-right">مبلغ</span>
            </div>
            <Separator />

            <div className="space-y-2">
              {transactions.map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-2 gap-2 rounded-lg border bg-card px-3 py-2.5 text-sm sm:grid-cols-12 sm:items-center"
                >
                  <div className="col-span-2 sm:col-span-3">
                    <Badge
                      variant="outline"
                      className={cn(
                        "border-transparent",
                        t.type === "REVENUE_SHARE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
                          : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
                      )}
                    >
                      {TXN_TYPE_LABELS[t.type] ?? t.type}
                    </Badge>
                  </div>

                  <div className="col-span-1 truncate text-xs text-muted-foreground sm:col-span-4">
                    <span className="text-muted-foreground/70 sm:hidden">
                      نوبت:{" "}
                    </span>
                    {t.reference_id || "—"}
                  </div>

                  <div className="text-left text-xs text-muted-foreground sm:col-span-2 sm:text-right">
                    {new Date(t.created_at).toLocaleDateString("fa-IR", {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>

                  <div className="text-left sm:col-span-3 sm:text-right">
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                      {formatToman(t.amount)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-sm font-medium">
                جمع این بازه از {transactions.length} تراکنش
              </span>
              <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatToman(ledgerTotal)}
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
