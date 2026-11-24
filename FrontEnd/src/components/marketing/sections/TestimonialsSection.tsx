/**
 * ============================================================================
 * CLINICK — TESTIMONIALS
 * ============================================================================
 * Authentic patient voices in an infinite horizontal marquee. Each quote card
 * carries credibility signals — star rating, verified-patient badge, the
 * specialty visited, the patient's age and the review date — so reviews read as
 * real experiences, not generic marketing. A soft gradient quote glyph keeps the
 * tone warm and trustworthy.
 * ============================================================================
 */

import Image from "next/image";
import { Quote, BadgeCheck } from "lucide-react";
import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { StarRating } from "@/components/marketing/ui/StarRating";
import { pickLocalized } from "@/lib/marketing/locale";
import type { Testimonial, Locale, LocalizedText } from "@/lib/marketing/types";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
}

function TestimonialCard({
  item,
  locale,
}: {
  item: Testimonial;
  locale: Locale;
}) {
  const name = pickLocalized(item.name, locale);

  return (
    <article className="group relative flex h-full w-[min(22rem,85vw)] shrink-0 flex-col gap-4 overflow-hidden rounded-3xl border border-border/70 bg-card p-7 shadow-soft transition-shadow duration-500 hover:shadow-card">
      <div className="flex items-center justify-between">
        <Quote
          aria-hidden="true"
          className="size-9 text-brand/15 transition-colors duration-500 group-hover:text-brand/30"
        />
        {item.verified ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2.5 py-1 text-[0.65rem] font-medium text-brand">
            <BadgeCheck className="size-3.5" />
            {locale === "en" ? "Verified patient" : "بیمار تأییدشده"}
          </span>
        ) : null}
      </div>

      <p className="flex-1 text-[0.95rem] leading-8 text-foreground/90 font-vazir">
        {pickLocalized(item.quote, locale)}
      </p>

      <StarRating value={item.rating} locale={locale} size={16} />

      <div className="flex items-center gap-3 border-t border-border/60 pt-4">
        {item.avatarUrl ? (
          <Image
            src={item.avatarUrl}
            alt={name}
            width={44}
            height={44}
            className="size-11 rounded-full object-cover"
          />
        ) : (
          <span className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-brand to-[var(--gradient-mid)] text-sm font-bold text-white">
            {initials(name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground font-vazir">{name}</p>
          {/* Meta: age · specialty · date */}
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {item.age ? (
              <span className="font-vazir">{pickLocalized(item.age, locale)}</span>
            ) : null}
            {item.specialty ? (
              <span className="inline-flex items-center gap-1">
                {item.age ? <span aria-hidden="true">·</span> : null}
                <span className="font-vazir">{pickLocalized(item.specialty, locale)}</span>
              </span>
            ) : null}
            {item.date ? (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden="true">·</span>
                <span className="font-vazir">{pickLocalized(item.date, locale)}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function TestimonialTrack({
  items,
  locale,
  inert,
}: {
  items: Testimonial[];
  locale: Locale;
  /** Hide the duplicated track from assistive tech. */
  inert?: boolean;
}) {
  return (
    <div className="flex gap-6 pe-6" aria-hidden={inert || undefined} inert={inert || undefined}>
      {items.map((item) => (
        <TestimonialCard key={item.id} item={item} locale={locale} />
      ))}
    </div>
  );
}

export function TestimonialsSection({
  eyebrow,
  title,
  description,
  items,
  locale,
}: {
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  description?: LocalizedText;
  items: Testimonial[];
  locale: Locale;
}) {
  if (items.length === 0) return null;

  return (
    <Section id="testimonials" tone="mesh" bleed>
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
          locale={locale}
        />
      </div>

      <div
        className="testimonials-marquee mt-12 overflow-hidden motion-reduce:overflow-x-auto"
        dir="ltr"
        aria-label={pickLocalized(title, locale) || "Testimonials"}
      >
        <div className="animate-marquee flex w-max">
          <TestimonialTrack items={items} locale={locale} />
          <TestimonialTrack items={items} locale={locale} inert />
        </div>
      </div>
    </Section>
  );
}
