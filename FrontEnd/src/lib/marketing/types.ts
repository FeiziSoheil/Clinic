/**
 * ============================================================================
 * CLINICK — MARKETING CONTENT MODEL
 * ============================================================================
 * A fully CMS-shaped, locale-aware content contract for the public clinic
 * website. Every piece of copy that a visitor can read lives here, so that the
 * admin panel (Enterprise backend) can edit it without touching the frontend.
 *
 * Design rules enforced by this model:
 *  - Nothing on the landing page is hard-coded English/Farsi copy. All strings
 *    are {@link LocalizedText} (Farsi primary, English optional) so the site is
 *    RTL/LTR + multilingual ready.
 *  - Every list is data-driven (announcements, services, doctors, FAQ, …) so
 *    the admin can add/remove items dynamically.
 *  - Colors, logo and imagery are referenced by URL from settings, never baked
 *    into components, so brand recoloring is a data change, not a code change.
 * ============================================================================
 */

/** Supported locales. Farsi is the primary language of the clinic. */
export type Locale = "fa" | "en";

/**
 * A piece of copy available in (at least) Farsi. English is optional so the
 * site degrades gracefully while a translation is still pending.
 */
export interface LocalizedText {
  fa: string;
  en?: string;
}

/** A call-to-action used across hero / sections / final banner. */
export interface CTA {
  label: LocalizedText;
  href: string;
  /** Lucide icon name (camelCase), rendered when provided. */
  icon?: string;
}

/** A single top navigation entry. */
export interface NavItem {
  label: LocalizedText;
  href: string;
}

/** Rotating announcement-bar message (e.g. "24/7 admission", "new service"). */
export interface Announcement {
  id: string;
  icon?: string;
  text: LocalizedText;
  href?: string;
}

/** A physical clinic branch (the site is multi-branch ready). */
export interface Branch {
  id: string;
  name: LocalizedText;
  address: LocalizedText;
  phone?: string;
  mapUrl?: string;
  isMain?: boolean;
}

export interface WorkingHour {
  day: LocalizedText;
  hours: LocalizedText;
}

export interface SocialLink {
  platform: string;
  label: LocalizedText;
  url: string;
}

export interface LegalBadge {
  label: LocalizedText;
  href?: string;
}

/** Brand-level, site-wide settings (the "settings" collection in the CMS). */
export interface MarketingSettings {
  clinicName: LocalizedText;
  tagline: LocalizedText;
  description: LocalizedText;
  /** Absolute or relative URL to the logo mark. */
  logoUrl?: string;
  /** Fallback text mark used when no logo asset is configured. */
  logoMark?: string;
  primaryPhone: string;
  emergencyPhone?: string;
  email: string;
  address: LocalizedText;
  branches: Branch[];
  workingHours: WorkingHour[];
  socials: SocialLink[];
  insurances: LocalizedText[];
  legalBadges: LegalBadge[];
}

/** A small floating glass card layered over the hero image. */
export interface FloatingCard {
  id: string;
  icon: string;
  title: LocalizedText;
  subtitle: LocalizedText;
  /** Visual tone drives the card accent color. */
  tone?: "brand" | "gold" | "success" | "info";
}

export interface HeroContent {
  eyebrow: LocalizedText;
  title: LocalizedText;
  /** Optional highlighted word rendered in the brand gradient. */
  highlight?: LocalizedText;
  description: LocalizedText;
  primaryCta: CTA;
  secondaryCta: CTA;
  imageUrl: string;
  imageAlt: LocalizedText;
  floatingCards: FloatingCard[];
  trustBadges: LocalizedText[];
}

export interface StatItem {
  id: string;
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  label: LocalizedText;
  icon?: string;
}

export interface ValueItem {
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface AboutContent {
  eyebrow: LocalizedText;
  title: LocalizedText;
  description: LocalizedText;
  paragraphs: LocalizedText[];
  mission: LocalizedText;
  vision: LocalizedText;
  values: ValueItem[];
  imageUrl: string;
  imageAlt: LocalizedText;
  badges: LocalizedText[];
}

export interface ServiceItem {
  id: string;
  slug: string;
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
  imageUrl: string;
  features: LocalizedText[];
  href: string;
}

export interface Doctor {
  id: string;
  slug: string;
  name: LocalizedText;
  specialty: LocalizedText;
  imageUrl: string;
  /** Medical council registration number (شماره نظام پزشکی). */
  medicalCouncilId?: string;
  yearsExperience?: number;
  rating?: number;
  reviewsCount?: number;
  daysAvailable?: LocalizedText[];
  bio?: LocalizedText;
  languages?: LocalizedText[];
  profileHref: string;
  bookHref: string;
  /** Clinic / branch the doctor practices at. */
  clinic?: LocalizedText;
  /** Consultation fee (raw number; formatted by the UI). */
  fee?: number;
  /** Next available slot, human readable (e.g. "امروز ۱۶:۰۰"). */
  nextSlot?: LocalizedText;
  /** Whether the doctor is available today. */
  availableToday?: boolean;
  /** Whether the doctor offers online (telehealth) consultations. */
  onlineConsult?: boolean;
  /** Whether the doctor's identity/credentials are verified. */
  verified?: boolean;
}

export interface FeatureItem {
  id: string;
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
  /** Short benefit bullets surfaced on the featured card. */
  benefits?: LocalizedText[];
  /** Marks the headline feature rendered ~2x larger. */
  featured?: boolean;
  /** Extra column span on the features grid (e.g. 2 to fill a leftover cell). */
  colSpan?: 2;
  /** Accent tone used by the card icon / illustration. */
  tone?: "brand" | "gold" | "info" | "success";
}

export interface ProcessStep {
  id: string;
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface Amenity {
  id: string;
  icon: string;
  title: LocalizedText;
  description: LocalizedText;
}

export interface Testimonial {
  id: string;
  name: LocalizedText;
  role?: LocalizedText;
  rating: number;
  avatarUrl?: string;
  quote: LocalizedText;
  /** Patient's age (e.g. "۳۴ ساله" / "34"). */
  age?: LocalizedText;
  /** Specialty the patient visited. */
  specialty?: LocalizedText;
  /** Human-readable review date (e.g. "فروردین ۱۴۰۴"). */
  date?: LocalizedText;
  /** Whether the patient is a verified (booked through the platform) user. */
  verified?: boolean;
}

export interface FaqItem {
  id: string;
  question: LocalizedText;
  answer: LocalizedText;
}

export interface Article {
  id: string;
  slug: string;
  title: LocalizedText;
  excerpt: LocalizedText;
  category: LocalizedText;
  imageUrl: string;
  readingTime?: number;
  publishedAt?: string;
  href: string;
}

export interface FinalCta {
  eyebrow?: LocalizedText;
  title: LocalizedText;
  description: LocalizedText;
  primaryCta: CTA;
  secondaryCta: CTA;
}

export interface ProcessSection {
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  description?: LocalizedText;
  steps: ProcessStep[];
}

/** Generic section wrapper so the CMS controls copy + ordering in one place. */
export interface SectionBlock<T> {
  eyebrow?: LocalizedText;
  title?: LocalizedText;
  description?: LocalizedText;
  items: T[];
}

/**
 * The complete, serializable content payload for the whole landing page.
 * `fetchMarketingContent()` resolves to this shape (live CMS or rich fallback).
 */
export interface MarketingContent {
  locale: Locale;
  settings: MarketingSettings;
  announcements: Announcement[];
  nav: NavItem[];
  hero: HeroContent;
  stats: SectionBlock<StatItem>;
  about: AboutContent;
  services: SectionBlock<ServiceItem>;
  doctors: SectionBlock<Doctor>;
  features: SectionBlock<FeatureItem>;
  process: ProcessSection;
  amenities: SectionBlock<Amenity>;
  testimonials: SectionBlock<Testimonial>;
  faq: SectionBlock<FaqItem>;
  articles: SectionBlock<Article>;
  finalCta: FinalCta;
}
