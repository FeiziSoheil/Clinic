/**
 * ============================================================================
 * CLINICK — PANEL KIT
 * ============================================================================
 * Shared primitives for authenticated app panels (Doctor / Reception / Admin).
 * Card styling matches the earnings dashboard: plain shadcn `Card` with
 * `ring-1 ring-foreground/10`, no soft-shadow lift or glow blobs.
 *
 * Drop-in primitives:
 *  - {@link PanelPageHeader}  consistent page title + actions header.
 *  - {@link PanelStatCard}    KPI / summary tile (earnings StatCard layout).
 *  - {@link GlassPanel}       content card wrapper (shadcn Card).
 * ============================================================================
 */

import type { ComponentProps } from "react";
import type { LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type PanelTone = "brand" | "gold" | "info" | "success" | "danger";

/** Icon tile colors aligned with the earnings page StatCards. */
const TONE: Record<PanelTone, { tile: string }> = {
  brand: {
    tile: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  },
  gold: {
    tile: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  },
  info: {
    tile: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  success: {
    tile: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  },
  danger: {
    tile: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  },
};

/* ── GlassPanel ───────────────────────────────────────────────────────────── */

export interface GlassPanelProps extends ComponentProps<"div"> {
  /** Kept for API compatibility; hover lift is no longer applied. */
  interactive?: boolean;
}

/** Content shell using the same shadcn Card surface as the earnings page. */
export function GlassPanel({
  className,
  interactive: _interactive = false,
  children,
  ...props
}: GlassPanelProps) {
  return (
    <Card className={cn("gap-0 py-0", className)} {...props}>
      <CardContent className="p-4">{children}</CardContent>
    </Card>
  );
}

/* ── PanelStatCard ────────────────────────────────────────────────────────── */

export interface PanelStatCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: PanelTone;
  /** Optional helper line under the value (e.g. trend). */
  hint?: React.ReactNode;
  /** Optional footer under the value (earnings-style). */
  footer?: React.ReactNode;
  className?: string;
}

/** KPI tile matching the doctor earnings page StatCard layout. */
export function PanelStatCard({
  icon: Icon,
  label,
  value,
  tone = "brand",
  hint,
  footer,
  className,
}: PanelStatCardProps) {
  const t = TONE[tone];
  return (
    <Card className={className}>
      <CardContent className="flex items-center gap-3 p-4">
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            t.tile,
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="truncate text-2xl font-bold leading-none tabular-nums">
            {value}
          </p>
          {footer ? <div className="pt-1 text-xs">{footer}</div> : null}
          {hint ? (
            <p className="pt-1 text-xs text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── PanelPageHeader ──────────────────────────────────────────────────────── */

export interface PanelPageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  tone?: PanelTone;
  /** Right-aligned actions (buttons, filters…). */
  actions?: React.ReactNode;
  className?: string;
}

export function PanelPageHeader({
  title,
  subtitle,
  icon: Icon,
  tone = "brand",
  actions,
  className,
}: PanelPageHeaderProps) {
  const t = TONE[tone];
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {Icon ? (
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-lg",
              t.tile,
            )}
          >
            <Icon className="size-5" />
          </span>
        ) : null}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {title}
          </h1>
          {subtitle ? (
            <p className="text-sm text-muted-foreground">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
