"use client";

/**
 * Shared admin finance report view (KPI cards + 3 charts).
 *
 * Used by both `/admin/dashboard` and `/admin/financial-reports`.
 * Data from `GET /v1/finance/dashboard` via {@link useDashboardReport}.
 */

import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarDays,
  DollarSign,
  TrendingDown,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDashboardReport } from "@/hooks/useReports";
import { cn, formatCurrency } from "@/lib/utils";
import type { DashboardRange } from "@/types/report";

/** Compact currency formatter bound for recharts ticks. */
const compactCurrency = (value: number) => formatCurrency(value);
/** Percentage formatter for no-show rates. */
const percent = (value: number) => `${value}%`;

interface DashboardReportViewProps {
  title: string;
  description: string;
}

export function DashboardReportView({
  title,
  description,
}: DashboardReportViewProps) {
  const [range, setRange] = useState<DashboardRange>("12m");
  const { data, isLoading, isError, error } = useDashboardReport({ range });

  useEffect(() => {
    if (isError && error) {
      import("sonner").then(({ toast }) => {
        toast.error("بارگذاری گزارش ناموفق بود", {
          description:
            error instanceof Error ? error.message : "خطای ناشناخته",
        });
      });
    }
  }, [isError, error]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Tabs
          value={range}
          onValueChange={(v) => setRange(v as DashboardRange)}
        >
          <TabsList>
            <TabsTrigger value="6m">۶ ماه گذشته</TabsTrigger>
            <TabsTrigger value="12m">۱۲ ماه گذشته</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <KpiCards data={data} isLoading={isLoading} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartCard title="روند درآمد" description="درآمد کل در گذر زمان">
          <RevenueAreaChart
            data={data?.revenue_trend ?? []}
            isLoading={isLoading}
          />
        </ChartCard>

        <ChartCard
          title="درآمد پزشکان"
          description="مبلغ واریزشده به کیف پول پزشکان در هر ماه"
        >
          <DoctorEarningsBarChart
            data={data?.doctor_earnings_trend ?? []}
            isLoading={isLoading}
          />
        </ChartCard>

        <ChartCard title="نرخ غیبت" description="درصد نوبت‌های از دست‌رفته">
          <NoShowLineChart
            data={data?.no_show_trend ?? []}
            isLoading={isLoading}
          />
        </ChartCard>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  KPI cards                                                                 */
/* -------------------------------------------------------------------------- */

function KpiCard({
  title,
  value,
  hint,
  icon,
}: {
  title: string;
  value: string;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="truncate text-2xl font-bold leading-none">{value}</p>
          <p className="pt-1 text-xs text-muted-foreground">{hint}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiCards({
  data,
  isLoading,
}: {
  data: ReturnType<typeof useDashboardReport>["data"];
  isLoading: boolean;
}) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[112px] w-full rounded-xl" />
        ))}
      </div>
    );
  }

  const { summary } = data;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <KpiCard
        title="درآمد کل"
        value={formatCurrency(summary.total_revenue)}
        hint="در بازهٔ انتخاب‌شده"
        icon={<DollarSign className="h-4 w-4" />}
      />
      <KpiCard
        title="کل نوبت‌ها"
        value={summary.total_appointments.toLocaleString("fa-IR")}
        hint="در بازهٔ انتخاب‌شده"
        icon={<CalendarDays className="h-4 w-4" />}
      />
      <KpiCard
        title="میانگین نرخ غیبت"
        value={`${summary.avg_no_show_rate}٪`}
        hint="کمتر، بهتر"
        icon={<TrendingDown className="h-4 w-4" />}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Chart helpers                                                             */
/* -------------------------------------------------------------------------- */

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ChartSkeleton({ className }: { className?: string }) {
  return <Skeleton className={cn("h-[260px] w-full", className)} />;
}

function RevenueAreaChart({
  data,
  isLoading,
}: {
  data: { month: string; revenue: number }[];
  isLoading: boolean;
}) {
  if (isLoading) return <ChartSkeleton />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickFormatter={compactCurrency}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={70}
        />
        <Tooltip formatter={(v) => [compactCurrency(Number(v)), "درآمد"]} />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke="var(--chart-1)"
          strokeWidth={2}
          fill="url(#revenueFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function DoctorEarningsBarChart({
  data,
  isLoading,
}: {
  data: { month: string; doctor_earnings: number }[];
  isLoading: boolean;
}) {
  if (isLoading) return <ChartSkeleton />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickFormatter={compactCurrency}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={70}
        />
        <Tooltip formatter={(v) => compactCurrency(Number(v))} />
        <Legend />
        <Bar
          dataKey="doctor_earnings"
          name="درآمد پزشکان"
          fill="var(--chart-3)"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

function NoShowLineChart({
  data,
  isLoading,
}: {
  data: { month: string; no_show_rate: number }[];
  isLoading: boolean;
}) {
  if (isLoading) return <ChartSkeleton />;
  return (
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
        <YAxis
          tickFormatter={percent}
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={48}
        />
        <Tooltip formatter={(v) => [percent(Number(v)), "غیبت"]} />
        <Line
          type="monotone"
          dataKey="no_show_rate"
          name="نرخ غیبت"
          stroke="var(--chart-4)"
          strokeWidth={2}
          dot={{ r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
