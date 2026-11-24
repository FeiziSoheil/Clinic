/**
 * ============================================================================
 * CLINICK — STATS BAND
 * ============================================================================
 * A focused strip of animated, locale-aware counters (number of physicians,
 * years of service, satisfied patients, satisfaction %, …). Each stat counts up
 * the first time it enters the viewport, reinforcing credibility at a glance.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { AnimatedCounter } from "@/components/marketing/motion/AnimatedCounter";
import { Icon } from "@/components/marketing/ui/icon";
import { pickLocalized } from "@/lib/marketing/locale";
import type { Locale, StatItem } from "@/lib/marketing/types";

export function StatsSection({
  items,
  locale,
}: {
  items: StatItem[];
  locale: Locale;
}) {
  return (
    <Section tone="default" className="py-12 sm:py-16">
      <Reveal
        variant="fade-up"
        stagger={0.08}
        className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border/70 bg-border/70 shadow-sm md:grid-cols-3 lg:grid-cols-6"
      >
        {items.map((stat) => (
          <div
            key={stat.id}
            className="flex flex-col items-center gap-2 bg-background px-4 py-8 text-center"
          >
            {stat.icon ? (
              <span className="mb-1 grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand">
                <Icon name={stat.icon} className="size-5" />
              </span>
            ) : null}
            <span className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">
              <AnimatedCounter
                value={stat.value}
                prefix={stat.prefix}
                suffix={stat.suffix}
                decimals={stat.decimals}
                locale={locale}
              />
            </span>
            <span className="text-sm text-muted-foreground">
              {pickLocalized(stat.label, locale)}
            </span>
          </div>
        ))}
      </Reveal>
    </Section>
  );
}
