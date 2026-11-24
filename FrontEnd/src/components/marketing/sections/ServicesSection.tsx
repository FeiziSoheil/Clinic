/**
 * ============================================================================
 * CLINICK — SERVICES
 * ============================================================================
 * Large, image-led cards for every medical specialty the clinic offers. Each
 * card reveals on scroll and reacts on hover with image zoom, soft elevation, a
 * gradient border glow and an animated icon — a premium, editorial grid rather
 * than a flat feature list.
 * ============================================================================
 */

import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { pickLocalized } from "@/lib/marketing/locale";
import type { Locale, ServiceItem } from "@/lib/marketing/types";

function ServiceCard({ service, locale }: { service: ServiceItem; locale: Locale }) {
  return (
    <Reveal
      variant="fade-up"
      className="group relative"
    >
      <Link
        href={service.href}
        data-cursor="hover"
        className="relative flex h-full flex-col overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:border-brand/40 hover:shadow-[0_30px_60px_-25px_rgba(15,23,42,0.35)]"
      >
        {/* Image */}
        <div className="relative aspect-[16/10] w-full overflow-hidden">
          <Image
            src={service.imageUrl}
            alt={pickLocalized(service.title, locale)}
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 90vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/10 to-transparent" />
          {/* Icon chip */}
          <span className="absolute bottom-4 ltr:left-4 rtl:right-4 grid size-12 place-items-center rounded-2xl marketing-glass text-white ring-1 ring-white/30 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-6">
            <Icon name={service.icon} className="size-6" />
          </span>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col gap-3 p-6">
          <h3 className="text-xl font-bold tracking-tight text-foreground transition-colors group-hover:text-brand">
            {pickLocalized(service.title, locale)}
          </h3>
          <p className="flex-1 text-sm leading-7 text-muted-foreground">
            {pickLocalized(service.description, locale)}
          </p>

          {service.features.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {service.features.map((f) => (
                <li
                  key={f.fa}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
                >
                  <Check className="size-3 text-brand" />
                  {pickLocalized(f, locale)}
                </li>
              ))}
            </ul>
          ) : null}

          <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
            {locale === "en" ? "Learn more" : "اطلاعات بیشتر"}
            <ArrowLeft className="size-4 rotate-180 transition-transform duration-300 group-hover:-translate-x-1 rtl:group-hover:translate-x-1 rtl:rotate-0" />
          </span>
        </div>

        {/* gradient border glow on hover */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 ring-1 ring-inset ring-brand/0 transition-all duration-500 group-hover:opacity-100 group-hover:ring-brand/30"
        />
      </Link>
    </Reveal>
  );
}

export function ServicesSection({
  eyebrow,
  title,
  description,
  items,
  locale,
}: {
  eyebrow?: import("@/lib/marketing/types").LocalizedText;
  title?: import("@/lib/marketing/types").LocalizedText;
  description?: import("@/lib/marketing/types").LocalizedText;
  items: ServiceItem[];
  locale: Locale;
}) {
  return (
    <Section id="services" tone="muted">
      <SectionHeading
        eyebrow={eyebrow}
        title={title}
        description={description}
        locale={locale}
      />
      <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 lg:gap-7">
        {items.map((service) => (
          <ServiceCard key={service.id} service={service} locale={locale} />
        ))}
      </div>
    </Section>
  );
}
