/**
 * ============================================================================
 * CLINICK — MARKETING HOME (COMPOSITION)
 * ============================================================================
 * Assembles the full public landing page. The flow is engineered for a
 * high-converting Healthcare SaaS narrative:
 *
 *   Hero → Trust → How It Works → Features →
 *   Ecosystem → Doctors → Testimonials → Social Proof → Security →
 *   Services → About → Articles → Amenities → FAQ → Final CTA
 *
 * Chrome (header / footer / smooth-scroll) comes from `app/(public)/layout.tsx`
 * via {@link MarketingShell}; this file only composes content sections.
 * Each section is an independent, reusable component that receives only the
 * data slice it needs, so the admin panel can reorder/toggle sections later.
 * ============================================================================
 */

import type { MarketingContent } from "@/lib/marketing/types";
import { HeroSection } from "@/components/marketing/sections/HeroSection";
import { TrustBarSection } from "@/components/marketing/sections/TrustBarSection";
import { HowItWorksSection } from "@/components/marketing/sections/HowItWorksSection";
import { FeaturesSection } from "@/components/marketing/sections/FeaturesSection";
import { EcosystemSection } from "@/components/marketing/sections/EcosystemSection";
import { DoctorsSection } from "@/components/marketing/sections/DoctorsSection";
import { TestimonialsSection } from "@/components/marketing/sections/TestimonialsSection";
import { SocialProofSection } from "@/components/marketing/sections/SocialProofSection";
import { SecuritySection } from "@/components/marketing/sections/SecuritySection";
import { ServicesSection } from "@/components/marketing/sections/ServicesSection";
import { AboutSection } from "@/components/marketing/sections/AboutSection";
import { ArticlesSection } from "@/components/marketing/sections/ArticlesSection";
import { AmenitiesSection } from "@/components/marketing/sections/AmenitiesSection";
import { FaqSection } from "@/components/marketing/sections/FaqSection";
import { FinalCtaSection } from "@/components/marketing/sections/FinalCtaSection";
import { StickyMobileCTA } from "@/components/marketing/sections/StickyMobileCTA";

export function MarketingHome({ content }: { content: MarketingContent }) {
  const { locale } = content;

  return (
    <>
      {/* ── Primary SaaS conversion narrative ─────────────────────────── */}
      <HeroSection hero={content.hero} locale={locale} />
      <TrustBarSection locale={locale} />
      <HowItWorksSection locale={locale} />
      <FeaturesSection
        eyebrow={content.features.eyebrow}
        title={content.features.title}
        description={content.features.description}
        items={content.features.items}
        locale={locale}
      />
      <EcosystemSection locale={locale} />
      <DoctorsSection
        eyebrow={content.doctors.eyebrow}
        title={content.doctors.title}
        description={content.doctors.description}
        items={content.doctors.items}
        locale={locale}
      />
      <TestimonialsSection
        eyebrow={content.testimonials.eyebrow}
        title={content.testimonials.title}
        description={content.testimonials.description}
        items={content.testimonials.items}
        locale={locale}
      />

      {/* ── Trust reinforcement ───────────────────────────────────────── */}
      <SocialProofSection locale={locale} />
      <SecuritySection locale={locale} />

      {/* ── Clinic depth (specialties, story, content) ────────────────── */}
      <ServicesSection
        eyebrow={content.services.eyebrow}
        title={content.services.title}
        description={content.services.description}
        items={content.services.items}
        locale={locale}
      />
      <AboutSection about={content.about} locale={locale} />
      <ArticlesSection
        eyebrow={content.articles.eyebrow}
        title={content.articles.title}
        description={content.articles.description}
        items={content.articles.items}
        locale={locale}
      />
      <AmenitiesSection
        eyebrow={content.amenities.eyebrow}
        title={content.amenities.title}
        description={content.amenities.description}
        items={content.amenities.items}
        locale={locale}
      />

      {/* ── Close ─────────────────────────────────────────────────────── */}
      <FaqSection
        eyebrow={content.faq.eyebrow}
        title={content.faq.title}
        description={content.faq.description}
        items={content.faq.items}
        locale={locale}
      />
      <FinalCtaSection data={content.finalCta} locale={locale} />

      {/* ── Mobile-only persistent conversion action ──────────────────── */}
      <StickyMobileCTA locale={locale} />
    </>
  );
}
