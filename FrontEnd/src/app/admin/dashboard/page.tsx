"use client";

/**
 * Admin Dashboard.
 *
 * Route: `/admin/dashboard`.
 *
 * Overview KPIs and charts from `GET /v1/finance/dashboard`.
 */

import { DashboardReportView } from "../_components/DashboardReportView";

export default function AdminDashboardPage() {
  return (
    <DashboardReportView
      title="داشبورد"
      description="نمای کلی عملکرد کلینیک"
    />
  );
}
