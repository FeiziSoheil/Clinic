/**
 * ============================================================================
 * CLINICK — SECTION HEADING
 * ============================================================================
 * Consistent section header: an eyebrow pill, a large word-revealed title, and
 * an optional supporting paragraph. Used by every content section so the visual
 * rhythm of the page stays coherent and on-brand.
 * ============================================================================
 */

import { cn } from "@/lib/utils";
import { TextReveal } from "@/components/marketing/motion/TextReveal";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { pickLocalized } from "@/lib/marketing/locale";
import type { LocalizedText, Locale } from "@/lib/marketing/types";

export interface SectionHeadingProps {
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  description?: LocalizedText;
  locale: Locale;
  /** Text alignment; centered for most sections, start for editorial ones. */
  align?: "center" | "start";
  /** Optional highlight phrase inside the title rendered in brand gradient. */
  highlight?: string;
  /** Light text for dark/inverted section bands. */
  onDark?: boolean;
  className?: string;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  locale,
  align = "center",
  highlight,
  onDark = false,
  className,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "items-center text-center" : "items-start text-start",
        className,
      )}
    >
      {eyebrow ? (
        <Reveal variant="fade" duration={0.6}>
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium text-brand",
              onDark
                ? "border-brand/40 bg-brand/15"
                : "border-brand/20 bg-brand/5",
            )}
          >
            <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
            {pickLocalized(eyebrow, locale)}
          </span>
        </Reveal>
      ) : null}

      {title ? (
        <TextReveal
          as="h2"
          text={pickLocalized(title, locale)}
          highlight={highlight ? pickLocalized({ fa: highlight }, locale) : undefined}
          highlightClassName="bg-gradient-to-l from-brand to-[var(--gradient-mid)] bg-clip-text text-transparent"
          className={cn(
            "text-balance font-bold tracking-tight",
            onDark ? "text-white" : "text-foreground",
            "text-3xl sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]",
          )}
        />
      ) : null}

      {description ? (
        <Reveal
          variant="fade-up"
          delay={0.1}
          className={cn(
            "max-w-2xl text-base leading-relaxed sm:text-lg",
            onDark ? "text-white/70" : "text-muted-foreground",
            align === "center" && "mx-auto",
          )}
        >
          {pickLocalized(description, locale)}
        </Reveal>
      ) : null}
    </div>
  );
}
