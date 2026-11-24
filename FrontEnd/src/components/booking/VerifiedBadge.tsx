/**
 * ============================================================================
 * CLINICK — VERIFIED BADGE (spec §7)
 * ============================================================================
 * Small trust pill marking a review/doctor as verified (real patient / real
 * medical system number). Uses the brand mint tint + success dot so it reads
 * "trustworthy" without competing with primary actions.
 * ============================================================================
 */

import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export function VerifiedBadge({
  label = "تأییدشده",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-meta font-medium",
        "bg-brand-mint/60 text-success ring-1 ring-success/20",
        className,
      )}
    >
      <BadgeCheck className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}
