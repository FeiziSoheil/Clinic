# Clinick — Public Clinic Website

Production-ready, premium, RTL-first landing page for a medical clinic. Built on
Next.js 16 (App Router), TypeScript, Tailwind v4, GSAP + Lenis, and a CMS-shaped
content model so the whole site is editable from the admin panel.

> This document captures the **Information Architecture, Site Map, Wireframes,
> Design System** and the **component architecture** of the public site.

---

## 1. Information Architecture

The site is a single, scroll-narrated landing page (plus future detail routes),
layered from "earn trust → understand → act".

```
Public Website (single landing page)
│
├─ 1. Announcement Bar        → rotating trust notices (24/7, insurance, …)
├─ 2. Header                  → sticky glass nav + primary CTA + patient-login
├─ 3. Hero                    → headline + 2 CTAs + clinic photo + floating cards
├─ 4. Stats Band              → animated counters (doctors, years, patients, …)
├─ 5. About / Story           → mission, vision, values
├─ 6. Services                → image-led specialty cards
├─ 7. Doctors                 → interactive physician grid
├─ 8. Features (patient UX)   → digital conveniences (e-prescription, smart queue…)
├─ 9. Process                 → 6-step appointment timeline
├─ 10. Amenities              → physical comforts (parking, lounge, pharmacy…)
├─ 11. Testimonials           → patient voices + ratings
├─ 12. Articles               → latest health articles
├─ 13. FAQ                    → accordion
├─ 14. Final CTA              → book / contact / patient-portal entry
└─ 15. Footer                 → quick links, services, contact, insurances, legal
```

**Future detail routes** (already referenced by the content model):
`/doctors/[slug]`, `/services/[slug]`, `/articles/[slug]`, `/booking`,
`/login` (patient portal entry).

---

## 2. Site Map

```
/                        → Marketing landing page (this build)
/login                   → Patient / staff portal entry (existing)
/booking                 → Appointment booking flow (planned)
/doctors                 → Doctor directory (planned)
/doctors/[slug]          → Doctor profile (planned)
/services/[slug]         → Service detail (planned)
/articles                → Article hub (planned)
/articles/[slug]         → Article detail (planned)
```

SEO assets emitted by the homepage: `MedicalOrganization`, `Physician` (per
doctor), `FAQPage`, `Article` (per article), `BreadcrumbList`, OpenGraph +
Twitter cards, canonical.

---

## 3. Wireframes (per section)

Each row = the desktop layout intent; everything collapses to a single column on
mobile with the same reading order.

| # | Section | Layout |
|---|---------|--------|
| 1 | Announcement | full-width slim bar, centered rotating text |
| 2 | Header | logo · center nav · [theme][login][Book] |
| 3 | Hero | 2-col: copy(eyebrow, H1, desc, 2 CTAs, trust badges) · photo with 3 floating glass cards + "open now" pill |
| 4 | Stats | single row of 6 stat cells (icon, big number, label) |
| 5 | About | 2-col: photo + floating badge · (eyebrow, H2, story, mission/vision cards, 2×2 values) |
| 6 | Services | 3-col card grid (image w/ icon chip, title, desc, feature chips, "learn more") |
| 7 | Doctors | 4-col card grid (portrait, specialty chip, name+years, rating+council, days, Book+Profile) |
| 8 | Features | 4-col icon tiles (icon, title, desc) with hover glow |
| 9 | Process | 6-step horizontal timeline w/ numbered nodes (→ vertical on mobile) |
| 10 | Amenities | 6-col compact icon grid |
| 11 | Testimonials | 3-col quote cards (quote glyph, text, stars, identity) |
| 12 | Articles | 3-col article cards (image, category, meta, title, excerpt) |
| 13 | FAQ | centered single-column accordion |
| 14 | Final CTA | full-width gradient band (eyebrow, H2, desc, 3 actions) |
| 15 | Footer | brand+socials · quick links · services · contact · insurances row · legal bar |

---

## 4. Design System

### 4.1 Color tokens (OKLCH, defined in `globals.css`)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--brand` | teal `oklch(0.51 0.095 187)` | `oklch(0.72 0.11 187)` | Primary actions, accents |
| `--gradient-mid` | `oklch(0.62 0.13 160)` | — | Gradient companion (green-teal) |
| `--gold` | `oklch(0.82 0.12 84)` | `oklch(0.86 0.13 86)` | Luxury micro-accent |
| `--background` | near-white `0.992` | slate `0.17` | Page surface |
| `--foreground` | slate `0.24` | `0.97` | Body text |
| `--muted-foreground` | `0.52` | `0.72` | Secondary text |
| `--card` / `--border` | white / `0.912` | `0.21` / `9% white` | Cards, dividers |

Semantic map: `--primary` = `--brand`, full shadcn semantic set (`card`,
`popover`, `muted`, `accent`, `destructive`, `ring`, `input`, charts 1–5,
sidebar set).

### 4.2 Typography

- **Family:** Vazirmatn (self-hosted, `font-vazir`), weights 400–800.
- **Scale:** `.text-display-xl` (clamp 2.5→4rem), `.text-display-lg`, body lg,
  plus Tailwind's fluid utilities. Headings use `tracking-tight`, `font-bold`.
- **RTL/LTR:** layout flips via Tailwind `rtl:`/`ltr:` variants; the document is
  `dir="rtl" lang="fa"` by default.

### 4.3 Spacing / Radius / Elevation

- **Section rhythm:** `.marketing-section { padding-block: clamp(4rem,8vw,6rem) }`.
- **Container:** `max-w-7xl` + responsive gutters.
- **Radius:** base `--radius: 0.875rem`, with `sm→4xl` scale tokens.
- **Elevation:** very soft shadows (`shadow-sm`, custom
  `0_30px_60px_-25px_rgba(15,23,42,.3)` on hover), subtle 1px borders.
- **Glass:** `.marketing-glass` (blur + saturate, theme-aware).

### 4.4 Motion system (GSAP + Lenis)

- `SmoothScroll` → one Lenis instance driven by the GSAP ticker, synced with
  ScrollTrigger. Disabled under `prefers-reduced-motion`.
- `Reveal` → scroll-reveal with variants (`fade-up`, `blur`, `scale`, `mask-up`,
  `slide-*`); content is never hidden via CSS (a11y-safe).
- `TextReveal` → word-level masked heading reveal, RTL-aware, optional
  gradient-highlight phrase.
- `AnimatedCounter` → viewport-triggered count-up with Persian numerals.
- `CustomCursor` → dot + lagging ring, magnifies on interactive elements;
  desktop + motion-only.

### 4.5 Components

`Section`, `SectionHeading`, `CTALink`, `BrandLogo`, `Icon` registry,
`SocialIcon`, `StarRating`; layout `SiteHeader`, `AnnouncementBar`, `SiteFooter`,
`MarketingShell`; one section component per IA block.

---

## 5. Content / CMS model

All copy lives in [`src/lib/marketing/types.ts`](../src/lib/marketing/types.ts)
(`MarketingContent`). Resolution in
[`cms-api.ts`](../src/lib/marketing/cms-api.ts):

1. Remote marketing CMS (`NEXT_PUBLIC_CMS_URL/site`) when configured.
2. Merge the **live** public doctor directory (`/api/v1/doctors`).
3. Rich Persian fallback ([`fallback-content.ts`](../src/lib/marketing/fallback-content.ts)).

So **nothing is hard-coded** — set `NEXT_PUBLIC_CMS_URL` to your headless CMS
and the admin panel drives logo, colors (via tokens), hero, services, doctors,
FAQ, articles, insurances, branches, hours, contact and more.

---

## 6. Accessibility & Performance

- Keyboard nav, focus states, ARIA (nav/dialog/accordion/region), skip-link.
- `prefers-reduced-motion` fully respected across every animation.
- Color contrast meets WCAG AA in light & dark.
- `next/image` with `sizes`/`priority`, ISR (`revalidate: 60s`), no layout shift.
- Static prerender of `/`; Lighthouse-friendly (code-split sections).
