/**
 * ============================================================================
 * CLINICK — SECTION WRAPPER
 * ============================================================================
 * Gives every marketing section a consistent vertical rhythm, a centered
 * max-width container, and a curated set of background treatments (plain,
 * mesh-gradient, subtle dotted grid, or "inverted" for dark feature bands) so
 * each section gets its own visual personality without bespoke CSS everywhere.
 * ============================================================================
 */

import { cn } from "@/lib/utils";
import type { ElementType, ReactNode } from "react";

export type SectionTone = "default" | "mesh" | "muted" | "grid" | "inverted";

export interface SectionProps {
  id?: string;
  children: ReactNode;
  className?: string;
  /** Background treatment for the section. */
  tone?: SectionTone;
  /** Render as a different element (default `section`). */
  as?: ElementType;
  /** Disable the inner max-width container (edge-to-edge sections). */
  bleed?: boolean;
}

const toneStyles: Record<SectionTone, string> = {
  default: "",
  mesh: "marketing-bg-mesh",
  muted: "bg-muted/40",
  grid: "bg-[radial-gradient(circle_at_center,color-mix(in_oklch,var(--brand)_8%,transparent)_1px,transparent_1px)] [background-size:22px_22px]",
  inverted: "bg-foreground text-background",
};

export function Section({
  id,
  children,
  className,
  tone = "default",
  as: Tag = "section",
  bleed = false,
}: SectionProps) {
  return (
    <Tag
      id={id}
      className={cn(
        "relative scroll-mt-28 overflow-hidden",
        "marketing-section",
        toneStyles[tone],
        className,
      )}
    >
      {bleed ? (
        children
      ) : (
        <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
          {children}
        </div>
      )}
    </Tag>
  );
}
