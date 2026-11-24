/**
 * Admin dashboard report types.
 *
 * These interfaces mirror the aggregations computed by the backend finance
 * domain (`internal/finance/finance.go` / `service.go`) and returned by the
 * `GET /v1/finance/dashboard` endpoint. Field names are kept snake_case to
 * match the JSON payload exactly (no client-side camelCase transform).
 */

/** Aggregation window applied to the dashboard data. */
export type DashboardRange = "6m" | "12m";

/** Optional filters passed to the dashboard endpoint. */
export interface DashboardFilters {
  range?: DashboardRange;
}

/** A single point in the revenue-over-time series. */
export interface RevenuePoint {
  /** Short month label, e.g. `"Jun"`. */
  month: string;
  /** Total revenue collected during the month (Toman). */
  revenue: number;
}

/** A single point in the doctor-earnings series. */
export interface DoctorEarningsPoint {
  month: string;
  /** Amount credited to doctors for the month (Toman). */
  doctor_earnings: number;
}

/** A single point in the no-show-rate series. */
export interface NoShowPoint {
  month: string;
  /** Percentage of appointments missed (0–100). */
  no_show_rate: number;
}

/** Top-level KPI summary numbers shown on the dashboard cards. */
export interface DashboardSummary {
  /** Sum of revenue across the selected window (Toman). */
  total_revenue: number;
  /** Total appointments in the selected window. */
  total_appointments: number;
  /** Mean no-show rate across the window (0–100). */
  avg_no_show_rate: number;
}

/**
 * Full dashboard payload: KPI summary plus the chart series.
 *
 * Returned by `GET /v1/finance/dashboard`.
 */
export interface DashboardReport {
  summary: DashboardSummary;
  revenue_trend: RevenuePoint[];
  doctor_earnings_trend: DoctorEarningsPoint[];
  no_show_trend: NoShowPoint[];
}
