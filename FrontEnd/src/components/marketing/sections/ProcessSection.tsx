/**
 * ============================================================================
 * CLINICK — APPOINTMENT PROCESS (TIMELINE)
 * ============================================================================
 * Walks the visitor through the six-step booking → care journey with a connected
 * timeline. On wide screens the steps sit on a horizontal rail; on small screens
 * they collapse to a vertical list. Each step reveals in sequence (cascade).
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { toPersianDigitsIfFa } from "@/components/marketing/ui/star-utils";
import { pickLocalized } from "@/lib/marketing/locale";
import type { ProcessSection as ProcessData, Locale } from "@/lib/marketing/types";

export function ProcessSection({
  data,
  locale,
}: {
  data: ProcessData;
  locale: Locale;
}) {
  const { eyebrow, title, description, steps } = data;

  return (
    <Section id="process" tone="muted">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        locale={locale}
      />

      <div className="relative mt-14">
        {/* horizontal connecting rail (desktop) */}
        <div
          aria-hidden="true"
          className="absolute top-7 hidden h-px w-full bg-gradient-to-l from-transparent via-border to-transparent lg:block"
        />

        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6 lg:gap-5">
          {steps.map((step, i) => (
            <Reveal as="li" key={step.id} variant="fade-up" delay={i * 0.08} className="relative flex flex-col items-center text-center lg:items-start lg:text-start">
              {/* node */}
              <div className="relative z-10 mb-4 flex items-center justify-center">
                <span className="grid size-14 place-items-center rounded-2xl border border-brand/20 bg-background text-brand shadow-sm">
                  <Icon name={step.icon} className="size-6" />
                </span>
                <span className="absolute -top-2 ltr:-right-2 rtl:-left-2 grid size-6 place-items-center rounded-full bg-brand text-[0.7rem] font-bold text-brand-foreground">
                  {toPersianDigitsIfFa(String(i + 1), locale)}
                </span>
              </div>
              <h3 className="text-base font-bold text-foreground">
                {pickLocalized(step.title, locale)}
              </h3>
              <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
                {pickLocalized(step.description, locale)}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
