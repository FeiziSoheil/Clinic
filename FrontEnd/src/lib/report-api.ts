/**
 * Admin dashboard / reports API module.
 *
 * Calls the real backend aggregation endpoint
 * `GET /v1/finance/dashboard?range=<6m|12m>`, which derives the KPI summary and
 * chart series from persisted invoices and appointments. There is no local mock
 * layer — the dashboard always reflects real clinic data.
 */

import { apiClient } from "./api";
import type {
  DashboardFilters,
  DashboardReport,
} from "@/types/report";

/**
 * Fetch the full admin dashboard report (KPI summary + 3 chart series) for the
 * selected range.
 */
export async function fetchDashboardReport(
  filters?: DashboardFilters,
): Promise<DashboardReport> {
  const res = await apiClient.get<DashboardReport>(
    "/v1/finance/dashboard",
    { params: filters },
  );
  return res.data;
}
