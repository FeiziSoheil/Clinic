"use client";

/**
 * ============================================================================
 * CLINICK — HERO (PRODUCT AS HERO)
 * ============================================================================
 * The signature first screen. The product is the hero: a real, in-browser
 * Patient dashboard (built in HTML/CSS — zero images, zero CLS) anchored by
 * floating glass annotations that point at genuine product moments (confirmed
 * appointment, e-prescription).
 *
 * The headline is a value proposition — it answers What / Who / Why in one
 * glance — and the CTAs are arranged as a clear primary + secondary hierarchy.
 * Subtle pointer parallax + ambient gradient glows keep the composition alive
 * without ever feeling gimmicky.
 * ============================================================================
 */

import { CheckCircle2, Star, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { pickLocalized } from "@/lib/marketing/locale";
import type { HeroContent, Locale } from "@/lib/marketing/types";
import { TextReveal } from "@/components/marketing/motion/TextReveal";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { CTALink } from "@/components/marketing/ui/CTALink";
import { DashboardMockup } from "@/components/marketing/ui/DashboardMockup";
import { toPersianDigitsIfFa } from "@/components/marketing/ui/star-utils";

export function HeroSection({ hero, locale }: { hero: HeroContent; locale: Locale }) {
  return (
    <section className="relative overflow-hidden">
      {/* Ambient gradient glows (brand identity) */}
      <div
        data-glow
        aria-hidden="true"
        className="pointer-events-none absolute -top-32 ltr:-left-24 rtl:-right-24 -z-10 size-[34rem] rounded-full bg-brand/20 opacity-50 blur-[120px]"
      />
      <div
        data-glow
        aria-hidden="true"
        className="pointer-events-none absolute top-40 ltr:right-0 rtl:left-0 -z-10 size-[28rem] rounded-full bg-[var(--gold)]/15 opacity-50 blur-[120px]"
      />
      {/* top hero glow tied to brand gradient */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60rem] [background:var(--gradient-hero-glow)]"
      />

      <div className="mx-auto grid w-full max-w-7xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.04fr_1fr] lg:gap-8 lg:pb-24 lg:pt-16 lg:px-10">
        {/* ── Copy ─────────────────────────────────────────────────── */}
        <div className="flex flex-col items-start gap-6">
          <Reveal variant="fade">
            <span className="inline-flex items-center gap-2 rounded-full border border-brand/20 bg-brand/5 px-4 py-1.5 text-sm font-medium text-brand">
              <span className="size-1.5 rounded-full bg-brand" aria-hidden="true" />
              {pickLocalized(hero.eyebrow, locale)}
            </span>
          </Reveal>

          <h1 className="text-balance text-4xl font-extrabold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-[3.4rem]">
            <TextReveal
              as="span"
              text={pickLocalized(hero.title, locale)}
              className="block"
              stagger={0.035}
            />
            {hero.highlight ? (
              <TextReveal
                as="span"
                text={pickLocalized(hero.highlight, locale)}
                className="mt-1 block"
                wordClassName="bg-gradient-to-l from-brand via-brand to-[var(--gradient-mid)] bg-clip-text text-transparent"
                stagger={0.035}
                delay={0.15}
              />
            ) : null}
          </h1>

          <Reveal variant="blur" delay={0.2} className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
            {pickLocalized(hero.description, locale)}
          </Reveal>

          {/* Strong CTA hierarchy */}
          <Reveal variant="fade-up" delay={0.3} className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <CTALink
              cta={hero.primaryCta}
              locale={locale}
              withArrow
              variant="default"
              className="h-13 min-w-44 justify-center rounded-xl px-8 text-base shadow-[var(--shadow-glow)]"
            />
            <CTALink
              cta={hero.secondaryCta}
              locale={locale}
              variant="outline"
              className="h-13 justify-center rounded-xl px-7 text-base"
            />
          </Reveal>

          {/* Trust badges */}
          <Reveal variant="fade-up" delay={0.4} className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
            {hero.trustBadges.map((badge) => (
              <span key={badge.fa} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <CheckCircle2 className="size-4 text-brand" />
                {pickLocalized(badge, locale)}
              </span>
            ))}
          </Reveal>

          {/* Inline rating social proof */}
          <Reveal variant="fade-up" delay={0.5} className="mt-1 flex items-center gap-3">
            <div className="flex items-center gap-1">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} className="size-4 text-amber-400" fill="currentColor" />
              ))}
            </div>
            <span className="text-sm text-muted-foreground">
              <span className="font-bold text-foreground">{toPersianDigitsIfFa("4.9", locale)}</span>{" "}
              {locale === "en" ? "from 12,000+ patients" : "از بیش از ۱۲٬۰۰۰ بیمار"}
            </span>
            <span className="hidden h-4 w-px bg-border sm:block" />
            <span className="hidden items-center gap-1.5 text-sm text-muted-foreground sm:inline-flex">
              <ShieldCheck className="size-4 text-brand" />
              {locale === "en" ? "Encrypted records" : "پرونده رمزنگاری‌شده"}
            </span>
          </Reveal>
        </div>

        {/* ── Product visual ───────────────────────────────────────── */}
        <Reveal variant="scale" delay={0.15} className="relative">
          <div data-depth={0} data-parallax className="relative">
            {/* Gradient halo behind the product */}
            <div
              aria-hidden="true"
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand/20 via-[var(--gradient-mid)]/15 to-transparent blur-2xl"
            />

            <DashboardMockup variant="patient" locale={locale} compact />

            {/* Floating product annotations (real moments, not decoration) */}
            <div
              data-float
              data-depth={1}
              className={cn(
                "marketing-glass absolute hidden items-center gap-2.5 rounded-2xl border border-white/40 p-2.5 shadow-xl sm:flex",
                "ltr:-left-5 rtl:-right-5 top-10",
              )}
            >
              <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/15 text-emerald-600 ring-1 ring-emerald-500/25 dark:text-emerald-400">
                <CheckCircle2 className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {locale === "en" ? "Appointment booked" : "نوبت رزرو شد"}
                </p>
                <p className="truncate text-[0.7rem] text-muted-foreground">
                  {locale === "en" ? "Dr. Razavi · Wed 10:30" : "دکتر رضوی · چهارشنبه ۱۰:۳۰"}
                </p>
              </div>
            </div>

            <div
              data-float
              data-depth={2}
              className={cn(
                "marketing-glass absolute hidden items-center gap-2.5 rounded-2xl border border-white/40 p-2.5 shadow-xl sm:flex",
                "bottom-12 ltr:-right-5 rtl:-left-5",
              )}
            >
              <span className="grid size-9 place-items-center rounded-xl bg-brand/10 text-brand ring-1 ring-brand/20">
                <ShieldCheck className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground">
                  {locale === "en" ? "E-prescription sent" : "نسخه الکترونیک ارسال شد"}
                </p>
                <p className="truncate text-[0.7rem] text-muted-foreground">
                  {locale === "en" ? "Synced to your record" : "همگام با پروندهٔ شما"}
                </p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
