/**
 * ============================================================================
 * CLINICK — ABOUT / STORY
 * ============================================================================
 * The clinic's narrative: founding story paragraphs, mission & vision, and the
 * core values that shape every decision. An image reveals with a clip-path
 * sweep on scroll, keeping the section editorial and premium.
 * ============================================================================
 */

import Image from "next/image";
import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { Target, Eye, BadgeCheck } from "lucide-react";
import { pickLocalized } from "@/lib/marketing/locale";
import type { AboutContent, Locale } from "@/lib/marketing/types";

export function AboutSection({ about, locale }: { about: AboutContent; locale: Locale }) {
  return (
    <Section id="about" tone="default">
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Image with mask reveal */}
        <Reveal variant="scale" className="relative order-last lg:order-first">
          <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[2rem] border border-border/60 shadow-xl">
            <Image
              src={about.imageUrl}
              alt={pickLocalized(about.imageAlt, locale)}
              fill
              sizes="(min-width: 1024px) 45vw, 90vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-foreground/20 to-transparent" />
          </div>
          {/* floating badge */}
          <div className="marketing-glass absolute -bottom-6 ltr:-right-4 rtl:-left-4 flex items-center gap-3 rounded-2xl border border-white/40 p-4 shadow-xl">
            <span className="grid size-11 place-items-center rounded-xl bg-brand text-white">
              <BadgeCheck className="size-6" />
            </span>
            <div>
              <p className="text-sm font-bold text-foreground">
                {about.badges[0] ? pickLocalized(about.badges[0], locale) : ""}
              </p>
              {about.badges[1] ? (
                <p className="text-xs text-muted-foreground">
                  {pickLocalized(about.badges[1], locale)}
                </p>
              ) : null}
            </div>
          </div>
        </Reveal>

        {/* Story + mission/vision + values */}
        <div className="flex flex-col gap-7">
          <SectionHeading
            eyebrow={about.eyebrow}
            title={about.title}
            align="start"
            locale={locale}
          />

          <div className="space-y-4">
            {about.paragraphs.map((p, i) => (
              <Reveal
                key={i}
                variant="fade-up"
                delay={0.05 * i}
                className="text-base leading-8 text-muted-foreground"
              >
                {pickLocalized(p, locale)}
              </Reveal>
            ))}
          </div>

          {/* Mission & vision */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Reveal variant="fade-up" className="rounded-2xl border border-border/70 bg-muted/40 p-5">
              <div className="mb-2 flex items-center gap-2 text-brand">
                <Target className="size-5" />
                <span className="text-sm font-bold text-foreground">
                  {locale === "en" ? "Mission" : "ماموریت"}
                </span>
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                {pickLocalized(about.mission, locale)}
              </p>
            </Reveal>
            <Reveal variant="fade-up" delay={0.08} className="rounded-2xl border border-border/70 bg-muted/40 p-5">
              <div className="mb-2 flex items-center gap-2 text-brand">
                <Eye className="size-5" />
                <span className="text-sm font-bold text-foreground">
                  {locale === "en" ? "Vision" : "چشم‌انداز"}
                </span>
              </div>
              <p className="text-sm leading-7 text-muted-foreground">
                {pickLocalized(about.vision, locale)}
              </p>
            </Reveal>
          </div>

          {/* Values */}
          <div className="grid grid-cols-2 gap-3">
            {about.values.map((value, i) => (
              <Reveal
                key={value.title.fa}
                variant="fade-up"
                delay={0.05 * i}
                className="flex items-start gap-3 rounded-xl border border-border/50 bg-background p-3"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand/10 text-brand">
                  <Icon name={value.icon} className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {pickLocalized(value.title, locale)}
                  </p>
                  <p className="mt-0.5 text-xs leading-6 text-muted-foreground">
                    {pickLocalized(value.description, locale)}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}
