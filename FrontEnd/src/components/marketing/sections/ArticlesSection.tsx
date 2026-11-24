/**
 * ============================================================================
 * CLINICK — ARTICLES
 * ============================================================================
 * The latest health articles — an editorial teaser grid (image, category,
 * title, excerpt, reading time) that drives visitors into the content hub and
 * supports SEO via Article structured data (emitted on the homepage).
 * ============================================================================
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock } from "lucide-react";
import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { CTALink } from "@/components/marketing/ui/CTALink";
import { toPersianDigitsIfFa } from "@/components/marketing/ui/star-utils";
import { pickLocalized } from "@/lib/marketing/locale";
import type { Article, Locale, LocalizedText } from "@/lib/marketing/types";

/** Format an ISO date as a compact Persian-digit Gregorian date. */
function formatDate(iso: string | undefined, locale: Locale): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = d.toLocaleDateString(locale === "en" ? "en-US" : "en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return toPersianDigitsIfFa(s, locale);
}

export function ArticlesSection({
  eyebrow,
  title,
  description,
  items,
  locale,
}: {
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  description?: LocalizedText;
  items: Article[];
  locale: Locale;
}) {
  return (
    <Section id="articles" tone="muted">
      <div className="flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-end">
        <SectionHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
          locale={locale}
          align="start"
          className="max-w-2xl"
        />
        <Reveal variant="fade" className="hidden shrink-0 sm:block">
          <CTALink
            cta={{
              label: { fa: "همه مقالات", en: "All articles" },
              href: "/articles",
              icon: "ArrowLeftRight",
            }}
            locale={locale}
            variant="outline"
          />
        </Reveal>
      </div>

      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((article, i) => (
          <Reveal key={article.id} variant="fade-up" delay={(i % 3) * 0.08} className="group h-full">
            <Link
              href={article.href}
              data-cursor="hover"
              className="flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-[0_30px_60px_-25px_rgba(15,23,42,0.3)]"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden">
                <Image
                  src={article.imageUrl}
                  alt={pickLocalized(article.title, locale)}
                  fill
                  sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 90vw"
                  className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                />
                <span className="absolute top-4 ltr:left-4 rtl:right-4 rounded-full marketing-glass px-3 py-1 text-xs font-semibold text-white ring-1 ring-white/25">
                  {pickLocalized(article.category, locale)}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-6">
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {article.publishedAt ? (
                    <time dateTime={article.publishedAt}>{formatDate(article.publishedAt, locale)}</time>
                  ) : null}
                  {typeof article.readingTime === "number" ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {toPersianDigitsIfFa(String(article.readingTime), locale)}{" "}
                      {locale === "en" ? "min" : "دقیقه"}
                    </span>
                  ) : null}
                </div>
                <h3 className="text-lg font-bold leading-7 text-foreground transition-colors group-hover:text-brand">
                  {pickLocalized(article.title, locale)}
                </h3>
                <p className="flex-1 text-sm leading-7 text-muted-foreground">
                  {pickLocalized(article.excerpt, locale)}
                </p>
                <span className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
                  {locale === "en" ? "Read article" : "ادامه مطلب"}
                  <ArrowLeft className="size-4 rotate-180 transition-transform duration-300 group-hover:-translate-x-1 rtl:group-hover:translate-x-1 rtl:rotate-0" />
                </span>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
