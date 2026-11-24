    "use client";

/**
 * ============================================================================
 * CLINICK — FAQ
 * ============================================================================
 * An accessible accordion of frequently asked questions. Built with native
 * <button>/<region> semantics (aria-expanded + aria-controls) and CSS height
 * transitions for a smooth, dependency-free expand/collapse that also feeds the
 * FAQPage structured data on the homepage.
 * ============================================================================
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { cn } from "@/lib/utils";
import { pickLocalized } from "@/lib/marketing/locale";
import type { FaqItem, Locale, LocalizedText } from "@/lib/marketing/types";

function FaqRow({ item, locale, isOpen, onToggle }: {
  item: FaqItem;
  locale: Locale;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm transition-colors hover:border-brand/30">
      <h3>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          className="flex w-full items-center justify-between gap-4 px-5 py-5 text-start"
        >
          <span className="text-base font-semibold text-foreground">
            {pickLocalized(item.question, locale)}
          </span>
          <span
            className={cn(
              "grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground transition-all duration-300",
              isOpen && "rotate-45 bg-brand text-brand-foreground",
            )}
          >
            <Plus className="size-4" />
          </span>
        </button>
      </h3>
      <div
        role="region"
        className={cn(
          "grid transition-all duration-300 ease-out",
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
        )}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-8 text-muted-foreground">
            {pickLocalized(item.answer, locale)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function FaqSection({
  eyebrow,
  title,
  description,
  items,
  locale,
}: {
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  description?: LocalizedText;
  items: FaqItem[];
  locale: Locale;
}) {
  const [openId, setOpenId] = useState<string | null>(items[0]?.id ?? null);

  return (
    <Section id="faq" tone="default">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        locale={locale}
      />

      <div className="mx-auto mt-12 flex max-w-3xl flex-col gap-3">
        {items.map((item, i) => (
          <Reveal key={item.id} variant="fade-up" delay={Math.min(i * 0.04, 0.2)}>
            <FaqRow
              item={item}
              locale={locale}
              isOpen={openId === item.id}
              onToggle={() => setOpenId((id) => (id === item.id ? null : item.id))}
            />
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
