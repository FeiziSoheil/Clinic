"use client";

import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert } from "lucide-react";

import { cn } from "@/lib/utils";
import type { CalloutVariant } from "../../constants/node-types";
import type { PMNode } from "../../types/document";

const STYLES: Record<
  CalloutVariant,
  { wrap: string; icon: typeof Info; label: string }
> = {
  info: {
    wrap: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-100",
    icon: Info,
    label: "اطلاعات",
  },
  warning: {
    wrap: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100",
    icon: AlertTriangle,
    label: "هشدار",
  },
  success: {
    wrap: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100",
    icon: CheckCircle2,
    label: "موفقیت",
  },
  danger: {
    wrap: "border-red-200 bg-red-50 text-red-950 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100",
    icon: OctagonAlert,
    label: "خطر",
  },
};

export function Callout({
  node,
  children,
}: {
  node: PMNode;
  children?: ReactNode;
}) {
  const variant = (String(node.attrs?.variant ?? "info") ||
    "info") as CalloutVariant;
  const style = STYLES[variant] ?? STYLES.info;
  const Icon = style.icon;
  const title = String(node.attrs?.title || style.label);

  return (
    <aside
      className={cn(
        "my-5 flex gap-3 rounded-2xl border px-4 py-3",
        style.wrap,
      )}
      role="note"
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-1">
        {title ? (
          <p className="text-sm font-semibold text-foreground">{title}</p>
        ) : null}
        <div className="text-sm leading-7 [&_p]:my-1">{children}</div>
      </div>
    </aside>
  );
}
