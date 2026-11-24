"use client";

/**
 * Admin — Financial Reports.
 *
 * Route: `/admin/financial-reports`.
 *
 * Clinic-wide revenue, doctor earnings, and no-show trends from
 * `GET /v1/finance/dashboard`.
 */

import { DashboardReportView } from "../_components/DashboardReportView";

export default function AdminFinancialReportsPage() {
  return (
    <DashboardReportView
      title="گزارش‌های مالی"
      description="درآمد، سهم پزشکان و نرخ غیبت کلینیک"
    />
  );
}
