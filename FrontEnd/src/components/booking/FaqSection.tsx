"use client";

/**
 * ============================================================================
 * CLINICK — SEARCHABLE FAQ (spec §13)
 * ============================================================================
 * Grouped, searchable accordion of frequently-asked questions with an empty
 * state. The FAQ data is also emitted as a `FAQPage` JSON-LD block (rendered
 * server-side by the parent page via {@link faqSchema}) so it can win rich
 * results.
 * ============================================================================
 */

import { useMemo, useState } from "react";
import { Search, SearchX } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toPersianDigits } from "@/lib/utils";

export interface FaqItem {
  q: string;
  a: string;
}
export interface FaqGroup {
  title: string;
  items: FaqItem[];
}

/** Build a FAQPage JSON-LD object from grouped items (call from a server page). */
export function faqSchema(groups: FaqGroup[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) =>
      g.items.map((it) => ({
        "@type": "Question",
        name: it.q,
        acceptedAnswer: { "@type": "Answer", text: it.a },
      })),
    ),
  };
}

export function FaqSection({ groups }: { groups: FaqGroup[] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (it) =>
            it.q.toLowerCase().includes(q) || it.a.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, query]);

  const totalMatches = filtered.reduce((n, g) => n + g.items.length, 0);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="relative">
        <Search
          className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="جستجو در سوالات متداول…"
          aria-label="جستجو در سوالات متداول"
          className="h-12 w-full rounded-xl border border-border bg-card ps-11 pe-4 text-base shadow-soft outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand"
        />
      </div>

      {query ? (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {toPersianDigits(totalMatches.toString())} نتیجه یافت شد
        </p>
      ) : null}

      {totalMatches === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border bg-muted/30 py-12 text-center">
          <SearchX className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-semibold">نتیجه‌ای پیدا نشد</p>
          <a href="tel:" className="text-sm font-medium text-brand-cyan hover:underline">
            تماس با پشتیبانی
          </a>
        </div>
      ) : (
        filtered.map((g) => (
          <section key={g.title} aria-labelledby={`faq-${g.title}`}>
            <h3 id={`faq-${g.title}`} className="mb-2 text-title-lg font-bold">
              {g.title}
            </h3>
            <Accordion type="single" className="flex flex-col gap-2">
              {g.items.map((it, i) => (
                <AccordionItem
                  key={`${g.title}-${i}`}
                  value={`${g.title}-${i}`}
                  className="overflow-hidden rounded-xl border border-border bg-card px-4"
                >
                  <AccordionTrigger className="py-4 text-start text-base font-medium hover:no-underline">
                    {it.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-4 text-sm leading-relaxed text-muted-foreground">
                    {it.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </section>
        ))
      )}
    </div>
  );
}
