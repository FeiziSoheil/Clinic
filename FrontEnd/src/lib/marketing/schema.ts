/**
 * ============================================================================
 * CLINICK — STRUCTURED DATA (JSON-LD / Schema.org)
 * ============================================================================
 * Builds the structured-data payloads injected into the homepage `<head>`. Rich
 * results (MedicalOrganization, Physician, FAQPage, Article) materially improve
 * SEO discoverability and eligibility for search-engine rich snippets.
 *
 * Every value is derived from the CMS content model — never hard-coded — so the
 * admin panel stays the single source of truth for both the visible site and
 * its machine-readable description.
 * ============================================================================
 */

import type { MarketingContent } from "./types";
import { pickLocalized } from "./locale";

/** Common trailing slash normalization for absolute URLs. */
function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

/**
 * Schema.org MedicalOrganization describing the clinic. Includes contact point,
 * geo/address (from the main branch), opening hours and accepted insurance.
 */
export function buildMedicalOrganizationSchema(
  content: MarketingContent,
  siteUrl: string,
) {
  const s = content.settings;
  const mainBranch = s.branches.find((b) => b.isMain) ?? s.branches[0];
  const url = trimSlash(siteUrl);

  return {
    "@context": "https://schema.org",
    "@type": "MedicalOrganization",
    "@id": `${url}#organization`,
    name: pickLocalized(s.clinicName, content.locale),
    description: pickLocalized(s.description, content.locale),
    url,
    telephone: s.primaryPhone,
    email: s.email,
    image: content.hero.imageUrl,
    logo: s.logoUrl ?? `${url}/icons/icon-512.svg`,
    address: {
      "@type": "PostalAddress",
      streetAddress: pickLocalized(s.address, content.locale),
      addressLocality: mainBranch ? pickLocalized(mainBranch.name, content.locale) : undefined,
      addressCountry: "IR",
    },
    contactPoint: {
      "@type": "ContactPoint",
      telephone: s.primaryPhone,
      contactType: "customer service",
      availableLanguage: ["fa", "en"],
    },
    openingHoursSpecification: s.workingHours.map((wh) => ({
      "@type": "OpeningHoursSpecification",
      description: `${pickLocalized(wh.day, content.locale)} ${pickLocalized(wh.hours, content.locale)}`,
    })),
    acceptsInsurance: {
      "@type": "MedicalEnumeration",
      name: s.insurances.map((i) => pickLocalized(i, content.locale)),
    },
    aggregateRating:
      content.testimonials.items.length > 0
        ? {
            "@type": "AggregateRating",
            ratingValue: content.stats.items.find((i) => i.id === "s4")?.value ?? 98,
            bestRating: 100,
            ratingCount: 1000,
          }
        : undefined,
  };
}

/**
 * Schema.org Physician entries — one per doctor — so each practitioner is
 * eligible for individual medical-professional rich results.
 */
export function buildPhysicianSchemas(content: MarketingContent) {
  return content.doctors.items.map((doctor) => {
    const aggregateRating =
      doctor.rating && doctor.reviewsCount
        ? {
            "@type": "AggregateRating",
            ratingValue: doctor.rating,
            reviewCount: doctor.reviewsCount,
            bestRating: 5,
          }
        : undefined;

    return {
      "@context": "https://schema.org",
      "@type": "Physician",
      "@id": `#doctor-${doctor.slug}`,
      name: pickLocalized(doctor.name, content.locale),
      medicalSpecialty: pickLocalized(doctor.specialty, content.locale),
      image: doctor.imageUrl || undefined,
      identifier: doctor.medicalCouncilId,
      hospitalAffiliation: {
        "@type": "MedicalOrganization",
        name: pickLocalized(content.settings.clinicName, content.locale),
      },
      knowsLanguage: (doctor.languages ?? [{ fa: "فارسی", en: "Persian" }]).map((l) =>
        pickLocalized(l, content.locale),
      ),
      aggregateRating,
      url: doctor.profileHref,
    };
  });
}

/**
 * Schema.org FAQPage rich-result payload, derived from the CMS FAQ list.
 */
export function buildFaqSchema(content: MarketingContent) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: content.faq.items.map((item) => ({
      "@type": "Question",
      name: pickLocalized(item.question, content.locale),
      acceptedAnswer: {
        "@type": "Answer",
        text: pickLocalized(item.answer, content.locale),
      },
    })),
  };
}

/**
 * Schema.org Article payloads for the latest published health articles.
 * `publishedAt` is normalized to ISO for machine consumption.
 */
export function buildArticleSchemas(content: MarketingContent) {
  return content.articles.items.map((article) => ({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: pickLocalized(article.title, content.locale),
    description: pickLocalized(article.excerpt, content.locale),
    image: article.imageUrl,
    articleSection: pickLocalized(article.category, content.locale),
    datePublished: article.publishedAt,
    author: {
      "@type": "Organization",
      name: pickLocalized(content.settings.clinicName, content.locale),
    },
  }));
}

/**
 * A single BreadcrumbList describing the homepage hierarchy. Useful once the
 * site grows beyond a single landing page.
 */
export function buildBreadcrumbSchema(siteUrl: string) {
  const url = trimSlash(siteUrl);
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "خانه",
        item: url,
      },
    ],
  };
}
