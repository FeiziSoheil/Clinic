/**
 * ============================================================================
 * CLINICK — CLINIC FEATURES (PATIENT BENEFITS)
 * ============================================================================
 * Presents the digital conveniences of the platform strictly from the patient's
 * point of view. A single "featured" capability is rendered ~2× larger (with
 * benefit bullets + a small illustrative record mockup) to create a clear
 * information hierarchy; the remaining capabilities sit in a refined grid of
 * secondary cards. Cards lift, glow and animate their icon on hover for a
 * tactile, premium feel.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { cn } from "@/lib/utils";
import { pickLocalized } from "@/lib/marketing/locale";
import type { FeatureItem, Locale } from "@/lib/marketing/types";

const TONE: Record<string, { ring: string; glow: string }> = {
  brand: { ring: "bg-brand/15 text-brand ring-brand/15", glow: "bg-brand/10" },
  gold: { ring: "bg-amber-500/15 text-amber-600 ring-amber-500/15 dark:text-amber-400", glow: "bg-amber-500/10" },
  info: { ring: "bg-sky-500/15 text-sky-600 ring-sky-500/15 dark:text-sky-400", glow: "bg-sky-500/10" },
  success: { ring: "bg-emerald-500/15 text-emerald-600 ring-emerald-500/15 dark:text-emerald-400", glow: "bg-emerald-500/10" },
};

function FeaturedCard({ feature, locale }: { feature: FeatureItem; locale: Locale }) {
  const tone = TONE[feature.tone ?? "brand"];
  return (
    <Reveal variant="fade-up" className="sm:row-span-2 lg:col-span-2">
      <div className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-brand/30 bg-card p-8 shadow-soft transition-all duration-500 hover:-translate-y-1.5 hover:border-brand/50 hover:shadow-card lg:p-10">
        {/* hover glow */}
        <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 size-56 rounded-full bg-brand/10 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />
        {/* gradient edge wash */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-l from-brand via-[var(--gradient-mid)] to-transparent" />

        <div className="flex items-center gap-3">
          <span className={cn("grid size-14 place-items-center rounded-2xl ring-1 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3", tone.ring)}>
            <Icon name={feature.icon} className="size-7" />
          </span>
          <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand font-vazir">
            {locale === "en" ? "Most loved" : "محبوب‌ترین"}
          </span>
        </div>

        <h3 className="mt-5 text-2xl font-bold tracking-tight text-foreground font-vazir sm:text-3xl">
          {pickLocalized(feature.title, locale)}
        </h3>
        <p className="mt-3 max-w-xl text-base leading-8 text-muted-foreground font-vazir">
          {pickLocalized(feature.description, locale)}
        </p>

        {feature.benefits && feature.benefits.length > 0 ? (
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {feature.benefits.map((b) => (
              <li key={b.fa} className="flex items-center gap-2.5">
                <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                  <Icon name="Check" className="size-3.5" strokeWidth={3} />
                </span>
                <span className="text-sm leading-6 text-foreground/90 font-vazir">
                  {pickLocalized(b, locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Mini illustration: a stylized record card */}
        <div className="mt-8 lg:mt-auto lg:pt-8">
          <div className="relative mx-auto w-full max-w-sm rounded-2xl border border-border/70 bg-muted/40 p-4">
            <div className="flex items-center gap-3">
              <span className="size-9 rounded-full bg-gradient-to-br from-brand to-[var(--gradient-mid)]" />
              <div className="flex-1 space-y-1.5">
                <span className="block h-2 w-2/3 rounded-full bg-foreground/15" />
                <span className="block h-2 w-1/2 rounded-full bg-foreground/10" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-lg border border-border/60 bg-background p-2">
                  <span className="block h-1.5 w-8 rounded-full bg-brand/40" />
                  <span className="mt-1.5 block h-3 w-10 rounded-full bg-foreground/15" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  );
}

function SecondaryCard({ feature, locale, index }: { feature: FeatureItem; locale: Locale; index: number }) {
  const tone = TONE[feature.tone ?? "brand"];
  return (
    <Reveal
      variant="fade-up"
      delay={(index % 4) * 0.05}
      className={cn("group relative", feature.colSpan === 2 && "sm:col-span-2")}
    >
      <div className="relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-soft transition-all duration-500 hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-card">
        <span aria-hidden="true" className={cn("pointer-events-none absolute -right-8 -top-8 size-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100", tone.glow)} />
        <span className={cn("relative grid size-12 place-items-center rounded-xl ring-1 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3", tone.ring)}>
          <Icon name={feature.icon} className="size-6" />
        </span>
        <div className="relative">
          <h3 className="text-base font-bold text-foreground font-vazir">
            {pickLocalized(feature.title, locale)}
          </h3>
          <p className="mt-1.5 text-sm leading-7 text-muted-foreground font-vazir">
            {pickLocalized(feature.description, locale)}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

export function FeaturesSection({
  eyebrow,
  title,
  description,
  items,
  locale,
}: {
  eyebrow?: import("@/lib/marketing/types").LocalizedText;
  title?: import("@/lib/marketing/types").LocalizedText;
  description?: import("@/lib/marketing/types").LocalizedText;
  items: FeatureItem[];
  locale: Locale;
}) {
  const featured = items.find((i) => i.featured) ?? items[0];
  const secondary = items.filter((i) => i.id !== featured?.id);

  return (
    <Section id="features" tone="grid">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        locale={locale}
      />

      {/*
        Featured spans 2 rows from sm up so side cards fill the gap; the trailing
        colSpan:2 card then consumes the leftover cell on both 2-col and 4-col grids.
      */}
      <div className="mt-12 grid gap-5 sm:grid-cols-2 sm:auto-rows-fr lg:grid-cols-4">
        {featured ? <FeaturedCard feature={featured} locale={locale} /> : null}
        {secondary.map((feature, i) => (
          <SecondaryCard key={feature.id} feature={feature} locale={locale} index={i} />
        ))}
      </div>
    </Section>
  );
}
