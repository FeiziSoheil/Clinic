/**
 * ============================================================================
 * CLINICK — AMENITIES (COMFORT)
 * ============================================================================
 * The physical comforts that make a visit pleasant (parking, accessibility,
 * lounge, free Wi-Fi, on-site pharmacy, elevators). A calm, icon-forward grid
 * that rounds out the "what to expect" picture alongside the digital features.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { pickLocalized } from "@/lib/marketing/locale";
import type { Amenity, Locale } from "@/lib/marketing/types";

export function AmenitiesSection({
  eyebrow,
  title,
  description,
  items,
  locale,
}: {
  eyebrow?: import("@/lib/marketing/types").LocalizedText;
  title?: import("@/lib/marketing/types").LocalizedText;
  description?: import("@/lib/marketing/types").LocalizedText;
  items: Amenity[];
  locale: Locale;
}) {
  return (
    <Section id="amenities" tone="default">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        locale={locale}
      />
      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {items.map((item, i) => (
          <Reveal
            key={item.id}
            variant="scale"
            delay={(i % 6) * 0.05}
            className="group flex flex-col items-center gap-3 rounded-2xl border border-border/60 bg-card p-5 text-center shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-md"
          >
            <span className="grid size-12 place-items-center rounded-xl bg-brand/10 text-brand transition-transform duration-500 group-hover:scale-110">
              <Icon name={item.icon} className="size-6" />
            </span>
            <div>
              <h3 className="text-sm font-bold text-foreground">
                {pickLocalized(item.title, locale)}
              </h3>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                {pickLocalized(item.description, locale)}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
