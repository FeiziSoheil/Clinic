"use client";

/**
 * ============================================================================
 * CLINICK — DOCTORS
 * ============================================================================
 * Landing grid of physicians using the shared minimal DoctorCard:
 * photo, identity, rating/fee, one availability signal, Book + Profile.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { DoctorCard, mapMarketingDoctorToCard } from "@/components/doctors";
import type { Doctor, Locale } from "@/lib/marketing/types";

export function DoctorsSection({
  eyebrow,
  title,
  description,
  items,
  locale,
}: {
  eyebrow?: import("@/lib/marketing/types").LocalizedText;
  title?: import("@/lib/marketing/types").LocalizedText;
  description?: import("@/lib/marketing/types").LocalizedText;
  items: Doctor[];
  locale: Locale;
}) {
  return (
    <Section id="doctors" tone="default">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        locale={locale}
      />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4 lg:gap-7">
        {items.map((doctor) => {
          const model = mapMarketingDoctorToCard(doctor, locale);
          return (
            <Reveal key={doctor.id} variant="fade-up" className="h-full">
              <DoctorCard {...model} locale={locale} />
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
