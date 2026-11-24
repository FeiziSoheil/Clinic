/**
 * ============================================================================
 * CLINICK — FINAL CTA
 * ============================================================================
 * A bold, full-bleed gradient band that closes the page with the three actions
 * a visitor is most likely to want: book online, contact us, and sign in to the
 * patient portal. Decorative floating glows give it depth without clutter.
 * ============================================================================
 */

import Link from "next/link";
import { PhoneCall, LogIn } from "lucide-react";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { TextReveal } from "@/components/marketing/motion/TextReveal";
import { CTALink } from "@/components/marketing/ui/CTALink";
import { pickLocalized } from "@/lib/marketing/locale";
import type { FinalCta as FinalCtaData, Locale } from "@/lib/marketing/types";

export function FinalCtaSection({ data, locale }: { data: FinalCtaData; locale: Locale }) {
  return (
    <section className="marketing-section">
      <div className="mx-auto w-full max-w-7xl px-5 sm:px-8 lg:px-10">
        <Reveal variant="scale">
          <div className="relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand via-brand to-[var(--gradient-mid)] px-6 py-16 text-center shadow-2xl shadow-brand/30 sm:px-12 lg:py-20">
            {/* decorative glows */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-24 ltr:-right-16 rtl:-left-16 size-72 rounded-full bg-white/15 blur-3xl"
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -bottom-32 ltr:-left-10 rtl:-right-10 size-80 rounded-full bg-[var(--gold)]/25 blur-3xl"
            />
            {/* dotted overlay */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:radial-gradient(circle,white_1px,transparent_1px)] [background-size:22px_22px]"
            />

            <div className="relative flex flex-col items-center gap-6">
              {data.eyebrow ? (
                <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium text-white ring-1 ring-white/25">
                  {pickLocalized(data.eyebrow, locale)}
                </span>
              ) : null}

              <TextReveal
                as="h2"
                text={pickLocalized(data.title, locale)}
                className="max-w-3xl text-balance text-3xl font-extrabold leading-tight text-white sm:text-4xl lg:text-5xl"
              />

              <p className="max-w-2xl text-base leading-8 text-white/85 sm:text-lg">
                {pickLocalized(data.description, locale)}
              </p>

              <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
                <CTALink
                  cta={data.primaryCta}
                  locale={locale}
                  withArrow
                  className="!bg-white !text-brand hover:!bg-white/90"
                />
                <a
                  href={data.secondaryCta.href}
                  data-cursor="hover"
                  className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-white/40 px-6 text-[0.95rem] font-medium text-white transition-colors hover:bg-white/10"
                >
                  <PhoneCall className="size-4" />
                  {pickLocalized(data.secondaryCta.label, locale)}
                </a>
              </div>

              {/* Patient portal entry */}
              <Link
                href="/login"
                data-cursor="hover"
                className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-white/80 underline-offset-4 transition-colors hover:text-white hover:underline"
              >
                <LogIn className="size-4" />
                {locale === "en" ? "Sign in to patient portal" : "ورود بیماران به سامانه"}
              </Link>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
