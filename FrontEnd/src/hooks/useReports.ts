/**
 * React Query hooks for the admin dashboard reports.
 *
 * Exposes a `reportKeys` factory (built with `as const` tuples) and a
 * `useDashboardReport` query hook that stays in sync with the selected range.
 */

import { useQuery } from "@tanstack/react-query";

import { fetchDashboardReport } from "@/lib/report-api";
import type { DashboardFilters } from "@/types/report";

/** Query-key factory for report/dashboard queries. */
export const reportKeys = {
  all: ["reports"] as const,
  dashboard: (filters?: DashboardFilters) =>
    ["reports", "dashboard", filters ?? {}] as const,
};

/**
 * Fetch the full dashboard report (KPI summary + 4 chart series).
 *
 * Automatically refetches when `filters.range` changes.
 */
export function useDashboardReport(filters?: DashboardFilters) {
  return useQuery({
    queryKey: reportKeys.dashboard(filters),
    queryFn: () => fetchDashboardReport(filters),
  });
}
