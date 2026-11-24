# Clinick — Patient Booking Experience
## Product Design Specification (PDS)

> **Document type:** Design + engineering blueprint. **No production code in this document.**
> **Audience:** Senior UI designer, senior frontend engineer, SEO, a11y, motion.
> **Locale:** RTL, Persian (`fa`) primary. English (`en`) secondary (i18n-ready).
> **Stack of record:** Next.js 16 (App Router, RSC) · React 19 · TypeScript · TailwindCSS v4 · shadcn · **GSAP + Lenis** (installed motion core) + `tw-animate-css` · @tanstack/react-query · zustand · lucide-react · sonner · recharts. Jalali calendar (`jalaali-js`, `jalali-calendar`).
> **North star:** *"The patient completes the entire booking flow before they ever log in — and after a one-tap OTP, the appointment is reserved and only payment remains. Progress is never lost."*

---

## 0. Grounding in the real codebase (read first)

This spec is implementable against the existing Clinick repo. Relevant facts:

- **Discovery data is mock-ready.** [`types/doctor.ts`](../src/types/doctor.ts) defines `Doctor` (`id, user_id, full_name, specialty, medical_system_number, visit_duration_minutes, visit_fee, avatar_url?, rating?, bio?`), `Shift` (`date, start_time, end_time, max_patients, is_active`), `TimeSlot` (`start_time, end_time, available, booked_count, max_patients`). [`lib/doctor-api.ts`](../src/lib/doctor-api.ts) exposes a `USE_MOCK` flag; several patient-facing fields are mock-only until the backend exposes them.
- **Booking DTOs exist** ([`types/booking.ts`](../src/types/booking.ts)): `BookAppointmentRequest { doctor_id, patient_id, start_time, end_time }`, `PayVisitFeeRequest { appointment_id }`, `JoinWaitingListRequest` (allows **guest** join: `patient_id?`, `phone`, `patient_name`, `entry_type`). Mutations live in [`hooks/useBooking.ts`](../src/hooks/useBooking.ts) (`useBookAppointment`, `usePayVisitFee`).
- **Auth completes via OTP** ([`lib/auth.ts`](../src/lib/auth.ts)): `sendOtp(phone)` → `verifyOtpLogin`/`verifyOtpRegister` → `{ user, token }`. The zustand [`authStore`](../src/store/authStore.ts) (`persist`, key `auth-storage`) exposes `login(user, token)`; the Axios interceptor in [`lib/api.ts`](../src/lib/api.ts) attaches the token.
- **Role redirect** ([`lib/role-redirect.ts`](../src/lib/role-redirect.ts)): `PATIENT` → `/doctors`. This is where the post-login **session-resume hook** fires.

> **Architectural consequence:** because `BookAppointmentRequest` requires `patient_id`, "book before auth" is realized as a **client-side Booking Draft** (persisted, see §B) that is *committed* to the backend only after OTP succeeds. This is the single most important interaction in the product.

---

## A. Global Design System

### A.1 Design tokens (extend existing `globals.css`)
OKLCH, defined once, exposed to Tailwind v4 via `@theme inline`. Reuse the current teal `--brand`; add the **Emerald/Teal/Mint ramp**.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand` (teal) | `oklch(0.51 0.095 187)` | `oklch(0.72 0.11 187)` | Primary actions, selected slot, focus |
| `--brand-emerald` | `oklch(0.58 0.13 165)` | `oklch(0.7 0.13 165)` | Gradient starts, "confirmed" |
| `--brand-mint` | `oklch(0.86 0.05 170)` | `oklch(0.34 0.05 170)` | Soft tints, hover washes |
| `--brand-cyan` | `oklch(0.78 0.10 200)` | `oklch(0.78 0.10 200)` | Links, accents |
| `--success` | `oklch(0.62 0.14 150)` | `oklch(0.7 0.15 150)` | Available slot, verified badge |
| `--gold` (existing) | `oklch(0.82 0.12 84)` | `oklch(0.86 0.13 86)` | Premium/rating micro-accent |
| `--radius` | `0.875rem`; scale `sm→4xl`; **cards/windows = `2xl`–`3xl` (≈24px)** | | |
| `--shadow-soft/-card/-float/-glow` | layered, soft | | Elevation tiers |
| `--gradient-brand` | `linear-gradient(135deg, emerald, brand 55%, cyan)` | | Hero, primary CTAs |

**Gradients are subtle** (≤16% brand in radial washes). No oversaturation.

### A.2 Typography
- **Family:** Vazirmatn (self-hosted, `font-vazir`, 400–800). `tabular-nums` for all numerals.
- **Scale (fluid):** display-xl `clamp(2.25rem,5vw,3.5rem)`, display-lg, title-lg `clamp(1.35rem,2.4vw,1.875rem)`, body-lg `1.125/1.7`, body, eyebrow `0.8rem/600/0.14em`, meta `0.8125rem`.
- **Persian numerals/dates** via `toLocaleString("fa-IR")` + `toPersianDigits` ([`lib/utils.ts`](../src/lib/utils.ts)). Jalali via existing [`jalali-calendar`](../src/components/ui/jalali-calendar.tsx) / [`jalali.ts`](../src/lib/jalali.ts).

### A.3 Spacing / layout
- 8px grid; 12-column; container `max-w-[80rem]`; section rhythm `clamp(4rem,8vw,6rem)`. Card padding `p-5 sm:p-6`. Generous whitespace is a feature.

### A.4 Motion (GSAP + Lenis, reduced-motion safe)
- Durations: instant `120ms`, fast `220ms`, base `420ms`, slow `700ms`. Eases: `--ease-out-soft` `cubic-bezier(.22,1,.36,1)`, spring `cubic-bezier(.34,1.56,.64,1)`.
- Animate **transform/opacity only**. Reuse [`SmoothScroll`](../src/components/marketing/motion/SmoothScroll.tsx), [`Reveal`](../src/components/marketing/motion/Reveal.tsx), [`TextReveal`](../src/components/marketing/motion/TextReveal.tsx), [`AnimatedCounter`](../src/components/marketing/motion/AnimatedCounter.tsx).
- `prefers-reduced-motion: reduce` → native scroll, instant reveals, frozen counters. **Never hide content.**

### A.5 Accessibility (WCAG 2.2 AA) — global
- Logical properties only (`ps/pe/ms/me/start/end`); `dir="rtl" lang="fa"` root.
- Visible focus (`focus-visible:ring-2 ring-brand`); skip-link to `#main`.
- Tap targets ≥ 44×44; target-size 2.2 ≥ 24px. Contrast 4.5:1 (3:1 large). No color-only signaling.
- Live regions: slot countdowns & availability `aria-live="polite"`. Dialogs/sheets/accordions/tabs keyboard-complete (arrows, Esc, Home/End).

### A.6 SEO — global
- One H1; H2 per section; no skipped levels. `MedicalOrganization` on home; per-doctor `Physician`; per-specialty collection pages; per-branch `LocalBusiness`/`MedicalClinic`; `Review`/`AggregateRating`; `FAQPage`; `BreadcrumbList`; OG/Twitter; canonical; `hreflang` when EN ships.
- Static/ISR for SEO pages (`revalidate: 60`); `next/image` with `sizes`/`priority` on LCP; lazy below fold.

### A.7 Reusable component library (atomic)
`SearchBar` · `QuickFilterChip` · `SpecialtyCard` · `DoctorCard` · `ReviewCard` · `RatingDistribution` · `FacetFilterBar` · `SortSelect` · `DoctorProfileDrawer` · `BookingCalendar` (Jalali) · `TimeSlotGrid` · `BookingSummaryPanel` · `BookingStepper` · `FavoriteToggle` · `VerifiedBadge` · `StatCounter` · `InsuranceLogoCloud` · `ServiceCard` · `ArticleCard` · `FaqSearchable` · `Gallery` · `SectionMap` · `CtaBlock`. Built atop existing shadcn primitives (`accordion`, `badge`, `button`, `card`, `dialog`, `sheet`, `tabs`, `popover`, `select`, `table`, `skeleton`, `tooltip`).

### A.8 Folder structure (prescriptive)
```
src/
├─ app/
│  ├─ (public)/                      # discovery + booking experience
│  │  ├─ layout.tsx                  # RTL, fonts, SEO, Providers, SmoothScroll
│  │  ├─ page.tsx                    # homepage = booking journey start
│  │  ├─ doctors/page.tsx            # discovery grid (SSR/ISR)
│  │  ├─ doctors/[slug]/page.tsx     # doctor SEO page (+BookingSlotLoader)
│  │  ├─ specialties/[slug]/page.tsx # specialty SEO collection
│  │  ├─ branches/[slug]/page.tsx    # branch SEO + LocalBusiness
│  │  ├─ services/[slug]/page.tsx
│  │  ├─ articles/[slug]/page.tsx
│  │  └─ booking/page.tsx            # /booking review (resumable, client)
│  └─ (auth)/login (existing, resume-aware)
├─ components/
│  ├─ discovery/ Search* · SpecialtyGrid · DoctorGrid · FacetBar · SortSelect
│  ├─ doctor/ DoctorCard · DoctorProfileDrawer · ReviewCard · RatingDistribution
│  ├─ booking/ BookingCalendar · TimeSlotGrid · SummaryPanel · BookingStepper · ResumeBanner
│  ├─ clinic/ ServiceCard · Gallery · ClinicMap · InsuranceLogoCloud
│  └─ marketing/ (existing motion + Section primitives)
├─ store/bookingSession.ts           # the draft session (see §B)
├─ hooks/ useBookingSession · useDoctorSlots · useResumeAfterLogin · useFavoriteDoctors
├─ lib/booking-session.ts            # draft type + validation + persist key
└─ ...
```

### A.9 State framework (empty / loading / error) — global
- **Loading:** skeletons matching final layout (no layout shift). Slot grids → `Skeleton` pills; lists → `Skeleton` cards. Above-the-fold is SSR/SSG (no skeleton).
- **Empty:** icon + Persian copy + 1 suggested action (e.g. "تاکنون نوبتی ثبت نشده" + "یافتن پزشک").
- **Error:** inline `destructive` message + retry; toasts (`sonner`) for transient; graceful fallback to mock (discovery) / cached data.

---

## B. Booking Session Architecture (the crown jewel)

> Implements the brief's *core*: complete booking **before** auth; OTP only **before payment**; resume seamlessly; never lose progress.

### B.1 The Booking Draft (client-side, persisted)
A zustand store (`persist`, key `booking-draft`, mirrors [`authStore`](../src/store/authStore.ts) pattern). Captures everything the patient chose **before** logging in:

```ts
interface BookingDraft {
  doctorId: string;          // Doctor.id
  branchId?: string;
  serviceId?: string;
  date: string;              // "YYYY-MM-DD" (Jalali rendered, Gregorian stored)
  startTime: string;         // "HH:mm"
  endTime: string;           // "HH:mm" (derived from visit_duration_minutes)
  insuranceId?: string;
  couponCode?: string;
  referralCode?: string;
  notes?: string;
  // client-only UI flags (not sent to backend):
  createdAt: number;         // used to expire stale drafts (TTL 24h)
  step: BookingStep;         // "search"|"doctor"|"datetime"|"summary"|"auth"|"pay"|"done"
}
```
**Why persisted:** survives reload, back-navigation, and the redirect to `/login` for OTP. TTL 24h; cleared on success or explicit cancel.

### B.2 Resume-after-OTP (the contract)
1. Patient builds the draft on `/` → `/doctors` → `/doctors/[slug]` → `/booking`.
2. At `/booking` (step `summary`), primary CTA is **"ادامه و پرداخت"** (Continue to payment).
3. If `authStore.user == null` → store a `resumeTo = "/booking"` intent (sessionStorage) → redirect to `/login?next=/booking` (OTP).
4. OTP success → `authStore.login(user, token)` → **`useResumeAfterLogin`** hook:
   - reads `resumeTo` → if `/booking` and a valid draft exists → `commit()`:
     - `useBookAppointment().mutate({ doctor_id, patient_id: user.id, start_time, end_time })`.
     - on success → `usePayVisitFee().mutate({ appointment_id })` (or route to payment step).
   - on error (slot taken) → show conflict state + suggest next slot (§E3) **without discarding** the draft.
5. Confirmation → draft cleared, `status: CONFIRMED/PENDING`, route to success view.

### B.3 Validity & conflict handling
- Draft `startTime` is re-validated against a fresh `TimeSlot` fetch on resume (slots change). If unavailable → **Conflict state** with "nearest 3 available slots" picker; the rest of the draft (doctor, insurance, notes) is preserved.

---

## C. Section-by-section specification

Each section below specifies all 19 required dimensions.

---

### SECTION 1 — Sticky Navigation
**UX Objective** — Always-available, transparent wayfinding into search, specialties, doctors, services, the clinic, and account, without blocking the booking journey.
**Business Objective** — Maximize discovery entry points; surface "Login" without pressuring; keep the primary action (search) one tap away.
**User Needs** — "Where do I start?", "How do I get back home/continue my booking?", "Is this trustworthy?"
**User Journey** — Land → glance nav → type in search or pick a nav entry → continue browsing with nav always present.
**Information Architecture** — `Logo | Search (compact) | Specialties · Doctors · Services · Clinic · Articles | [theme] [Login]`.
**Wireframe Description** — Full-bleed glass bar; top transparent, on scroll>40px gains `border-b` + stronger blur + shrinks 72→64px. Mobile: `[Logo] [⌕] [☰]` → Sheet nav. A **"ادامه رزرو"** (Resume booking) pill appears in nav whenever a valid `BookingDraft` exists.
**Component Tree** — `StickyNav → BrandMark · CompactSearchBar · PrimaryNav(MegaMenu for Specialties) · ThemeToggle · LoginButton · ResumeBookingPill · MobileNavSheet`.
**Motion Specification** — Background fade/blur on scroll (GSAP ScrollTrigger, 220ms); MegaMenu height+opacity open (220ms `--ease-out-soft`); Resume pill `scale-in` when draft appears.
**Responsive Behaviour** — ≥lg: full nav + mega menu; md: condensed labels; <lg: Sheet + search in sheet. Resume pill always visible if draft exists.
**Accessibility Rules** — `<nav aria-label="اصلی">`; keyboard-operable mega menu (arrow/Esc/Home/End); skip-link before nav; 44px targets; focus trap in sheet.
**Design Tokens** — `.surface-glass`, `--shadow-soft` on scroll, `--brand` on active/hover, `--radius-xl`.
**Copywriting (fa)** — Specialties «تخصص‌ها», Doctors «پزشکان», Services «خدمات», Clinic «کلینیک», Articles «مقالات», Login «ورود», Search placeholder «جستجوی پزشک، تخصص یا نشانه…», Resume «ادامه رزرو».
**Loading States** — Nav is static SSR; no skeleton. Resume pill hydrates after mount.
**Empty States** — No draft → Resume pill hidden.
**Error States** — Nav static; resilient.
**SEO Recommendations** — Link to specialty/doctor/branch collections (internal linking); `Brand` `Organization` in JSON-LD; `prefetch` nav targets.
**Interaction Details** — Mega menu opens on hover/focus; Esc closes; click-outside closes; search focus shortcut `/`.
**Visual Hierarchy** — Logo (wordmark) → search (grows) → nav links (muted) → Login (outline) → Resume (brand).
**Conversion Strategy** — Search is the #1 entry; Resume pill recovers abandoned bookings (hidden CRO lever).

---

### SECTION 2 — Hero (booking journey start)
**UX Objective** — In one viewport, convey "find the right doctor, trust this clinic, book in under a minute" and start the journey.
**Business Objective** — Drive the highest-intent action: search → doctor → slot.
**User Needs** — "Can I quickly find the right doctor?", "Is this credible?", "How fast can I book?"
**User Journey** — Read headline → focus search → (type/speak symptom or pick a popular search) → land on `/doctors` results; simultaneously eye the live booking preview on the right.
**Information Architecture** — 2-col: Left = eyebrow + H1 + promise + **IntelligentSearchBar** + QuickFilters + Popular/Recent searches + CTA. Right = **live booking preview** (DoctorCard + Jalali calendar + TimeSlots + mini-reviews + availability pill + floating "نوبت تکمیل شد" toast).
**Wireframe Description** — `lg:grid-cols-2`. Search input with segmented scope chips (نام پزشک/تخصص/نشانه/شعبه/بیمه) + "اولین نوبت خالی" toggle + autocomplete dropdown (popular/recent). Right preview is a faux but realistic booking UI, layered floating cards (glass), subtle parallax.
**Component Tree** — `Hero → CopyBlock(Eyebrow, H1+gradient highlight, Promise, CTACluster) · IntelligentSearchBar(ScopeChips, Autocomplete, RecentSearches, PopularSearches, QuickFilters) · BookingPreview(DoctorCardMini, BookingCalendar, TimeSlotGrid, ReviewStrip, AvailabilityPill, FloatingToasts)`.
**Motion Specification** — Headline `mask-up` word stagger (700ms); CTAs `fade-up` stagger 80ms; preview `scale-in`+glow sweep; floating cards ambient `float`; a toast "نوبت رزرو شد" appears at 2s; calendar day highlight sweeps; counter ticks. Reduced-motion → instant.
**Responsive Behaviour** — ≥lg 2-col; <lg stacks: copy first, then search, then preview (simplified, 2 floating cards max). Search is full-width on mobile.
**Accessibility Rules** — Search is a real `<form role="search">` with `<label>`; combobox `aria-expanded/controls/activedescendant`; live results `aria-live="polite"`; preview purely decorative → `aria-hidden` OR exposed as a labelled example region with real semantics.
**Design Tokens** — `--gradient-hero-glow` behind; `--radius-2xl` cards; `--shadow-float` on floating tiles; `--brand-emerald→cyan` gradient on H1 highlight.
**Copywriting (fa)** — Eyebrow «بهداشت هوشمند، رزرو بی‌دردسر»; H1 «پزشک مناسب را پیدا کن و در یک دقیقه نوبت بگیر»; highlight «یک دقیقه»; Promise «بدون انتظار، بدون تماس، بدون کاغذ»; CTA primary «جستجوی پزشک» / ghost «اولین نوبت خالی»; placeholders as in §1.
**Loading States** — Hero SSR; search results dropdown uses skeleton rows on fetch.
**Empty States** — No query → Popular searches (دندان‌پزشک، قلب، کودکان…) + Recent searches (if any) + "اولین نوبت خالی" quick filter.
**Error States** — 0 results → empty dropdown with suggestions + spelling-tolerant hint; backend down → fall back to mock.
**SEO Recommendations** — H1 contains primary keyword; the search form posts to `/doctors` (crawlable links to popular specialties); `SearchAction` in `WebSite` JSON-LD; LCP = headline/preview, optimized image.
**Interaction Details** — Autocomplete keyboard nav (↑↓ Enter Esc); clicking a popular search submits with that query; "اولین نوبت خالی" sorts results by earliest availability.
**Visual Hierarchy** — H1 (largest) → search (dominant interactive) → quick filters (chips) → preview (supporting, alive).
**Conversion Strategy** — Search is the hero CTA; preview social-proofs speed; "اولین نوبت خالی" reduces friction to 1 tap.

---

### SECTION 3 — Trust Indicators
**UX Objective** — Instantly establish credibility with hard numbers and security badges.
**Business Objective** — Lower perceived risk before booking.
**User Needs** — "Do real people use this?", "Is my data safe?"
**User Journey** — Scroll past hero → numbers count up → feel reassured → continue to specialties.
**Information Architecture** — Full-width band: logo cloud (grayscale→color on hover) + 4–6 animated counters + security/badge row.
**Wireframe Description** — Row of counters (patients served, doctors, appointments completed, verified reviews, branches, years); below: partner insurance mini-logos + security badges (https lock, data encryption).
**Component Tree** — `TrustBar → LogoMarquee · StatCounter×N(AnimatedCounter) · SecurityBadges`.
**Motion Specification** — Logos marquee (CSS; static under reduced-motion); counters count up on enter (existing `AnimatedCounter`); badges subtle `fade-up`.
**Responsive Behaviour** — Counters wrap 2/row on mobile, 3–4 on desktop. Marquee pauses on hover/focus.
**Accessibility Rules** — Counter exposes final value via `aria-label`/`title`; decorative logos `alt=""`; marquee respects reduced-motion and is `aria-hidden` if purely decorative.
**Design Tokens** — Neutral band (`bg-muted/40`), `--brand` numerals, `--success`/`--gold` accents minimal.
**Copywriting (fa)** — «بیمار خدمت‌رسانی‌شده», «پزشک متخصص», «نوبت تکمیل‌شده», «نظر تأییدشده», «شعبه فعال», «سال تجربه».
**Loading States** — SSR numbers render at final value; animation is enhancement only (a11y-safe).
**Empty States** — If CMS empty → hide section (never show zeros).
**Error States** — CMS fail → fallback copy/numbers.
**SEO Recommendations** — Wrap in `<section aria-label="اعتبار کلینیک">`; numbers in text for crawlers; `MedicalOrganization` aggregates.
**Interaction Details** — Hover a counter → tooltip with definition/source; pause marquee on hover.
**Visual Hierarchy** — Big numerals (display) > small labels (meta).
**Conversion Strategy** — Trust reduces abandonment at later auth step; security badges pre-justify OTP/data collection.

---

### SECTION 4 — Medical Specialties
**UX Objective** — Let patients explore care categories visually and jump straight to relevant doctors.
**Business Objective** — Distribute demand across specialties; create crawlable specialty pages.
**User Needs** — "Which specialty matches my need?", "Are there doctors available now?"
**User Journey** — Browse specialty grid → hover/tap a card → see doctor count, rating, earliest slot → click → `/specialties/[slug]`.
**Information Architecture** — Responsive icon grid (3–4 cols desktop). Each card: icon, name, doctor count, avg rating, first available appointment, hover CTA.
**Wireframe Description** — `SpecialtyCard`: soft tinted tile (`--brand-mint` wash), centered icon chip, specialty name (title-lg), meta row («۱۲ پزشک» · ★4.8), availability pill («نزدیک‌ترین: فردا ۱۰:۳۰»), hover → lift + reveal "مشاهده پزشکان".
**Component Tree** — `SpecialtyGrid → SpecialtyCard(Icon, Name, DoctorCount, AvgRating, FirstAvailable, CTA)`.
**Motion Specification** — Cards stagger `fade-up`; hover `-translate-y-1` + `shadow-card→float` (220ms); availability pill subtle pulse.
**Responsive Behaviour** — 4→3→2→1 columns; cards keep aspect.
**Accessibility Rules** — Whole card is a single link (`<a>`) with descriptive accessible name; icon `aria-hidden`; focus ring on card.
**Design Tokens** — `--brand-mint` tint, `--radius-2xl`, `--shadow-soft`→`float`, `--success` availability.
**Copywriting (fa)** — Example specialties: «قلب و عروق», «داخلی», «دندان‌پزشکی», «اورولوژی», «زنان و زایمان», «اطفال», «چشم», «پوست و مو». Hover CTA «مشاهده پزشکان».
**Loading States** — Skeleton grid of tiles.
**Empty States** — No specialties → "به‌زودی تخصص‌های بیشتری اضافه می‌شود".
**Error States** — Fallback to seeded list.
**SEO Recommendations** — Each card links to `/specialties/[slug]` (dedicated SEO page with `MedicalSpecialty`/collection `ItemList`); descriptive anchors.
**Interaction Details** — Hover reveals CTA; tap navigates; keyboard Enter activates.
**Visual Hierarchy** — Icon → name → meta → availability.
**Conversion Strategy** — Availability pill creates urgency; one tap to filtered doctors.

---

### SECTION 5 — Doctor Discovery
**UX Objective** — Booking.com-grade discovery: compare doctors on the criteria that matter, fast.
**Business Objective** — Convert browsers into a slot selection.
**User Needs** — "Can I compare doctors?", "Can I find the earliest/cheapest/best?", "Can I filter to my needs?"
**User Journey** — `/doctors` → set facets (specialty, gender, insurance, availability, branch, rating, experience, price, language) → sort → scan cards → favorite → "Book" or "View Profile".
**Information Architecture** — Layout: left `FacetFilterBar` (collapsible on mobile as Sheet), top `SortSelect` + result count, main `DoctorGrid`. Sticky filter bar on scroll.
**Wireframe Description** — `DoctorCard`: portrait (next/image, lazy), name + specialty, medical council number («نظام پزشک: ۱۲۳۴۵»), years experience, branch, languages, insurance badges, visit fee (`formatToman`), rating + review count, **first available appointment** + next available day, online-consult badge, actions: «نوبت‌دهی», «مشاهده پروفایل», favorite (heart).
**Component Tree** — `DiscoveryView → FacetBar(FacetGroup×) · ResultToolbar(SortSelect, Count) · DoctorGrid(DoctorCard×) · MobileFilterSheet · ActiveFacetChips · Pagination/InfiniteScroll`.
**Motion Specification** — Card hover lift; favorite heart `scale-spring` + fill; filters change → results `fade` + staggered card enter; skeleton shimmer during refetch.
**Responsive Behaviour** — ≥lg sidebar facets; <lg FacetBar behind "فیلترها" button (Sheet) + active-facet chips.
**Accessibility Rules** — Facets are a `<form>`; `aria-pressed` on toggle chips; results region `aria-live="polite"` announces count; each card a clickable article with heading; sort is a labelled `<select>`.
**Design Tokens** — `--brand-mint` for online-consult badge, `--success` for availability, `--gold` for rating, `--radius-2xl` cards, `--shadow-card`.
**Copywriting (fa)** — «پزشکان», «مرتب‌سازی», «بالاترین امتیاز/نزدیک‌ترین نوبت/کم‌ترین هزینه/بیشترین تجربه», «نوبت‌دهی», «مشاهده پروفایل», «مشاوره آنلاین», «نوبت بعدی», Filters: «جنسیت، بیمه، شعبه، امتیاز، تجربه، هزینه، زبان، نوبت خالی».
**Loading States** — Skeleton cards (portrait + lines); keep facets interactive.
**Empty States** — 0 results → «پزشکی مطابق فیلترها یافت نشد» + clear-filters CTA + 3 suggested loosened queries.
**Error States** — Fetch error → retry banner; fallback to mock (`USE_MOCK`).
**SEO Recommendations** — Server-rendered list; querystring facets indexable (`?specialty=...`); links to `/doctors/[slug]`; `BreadcrumbList`.
**Interaction Details** — Debounced search (250ms); facet change updates URL (shareable) + query; favorite persisted (local + API when authed).
**Visual Hierarchy** — Portrait + name dominant; rating & availability next; fee + CTA bottom.
**Conversion Strategy** — "نزدیک‌ترین نوبت" default sort + availability pill drive urgency; fee transparency reduces drop-off.

---

### SECTION 6 — Doctor Profile Preview (Drawer/Modal)
**UX Objective** — Rich, fast profile access without a full page load (and also available as a full SEO page).
**Business Objective** — Provide enough trust + detail to commit to booking.
**User Needs** — "Can I trust this doctor?", "When can I see them?", "What do patients say?"
**User Journey** — From card → "مشاهده پروفایل" → drawer slides in → scan bio/edu/certs/schedule/reviews → pick date/time → draft starts → "ادامه رزرو".
**Information Architecture** — Right-side Sheet (lg) / bottom Sheet (mobile). Sections: header (portrait, name, specialty, council#, rating), tabs (درباره / سوابق / برنامه نوبت‌ها / نظرات / گالری و موقعیت), sticky footer CTA.
**Wireframe Description** — Tabs: About (bio, education, certificates, memberships, languages, accepted insurance, fee); Schedule (Jalali `BookingCalendar` + `TimeSlotGrid`); Reviews (summary + list); Gallery+Map. Footer: «ادامه رزرو» (writes draft) + «مشاوره آنلاین».
**Component Tree** — `DoctorProfileDrawer → ProfileHeader · Tabs(AboutTab, CredentialsTab, ScheduleTab, ReviewsTab, GalleryMapTab) · StickyFooter(CTACluster)`.
**Motion Specification** — Sheet slide+fade (spring, 320ms); tab content cross-fade (260ms); calendar day selection `scale` highlight; slot select `fill` animation; shared-element transition from card portrait (optional).
**Responsive Behaviour** — lg right drawer (max-w ~40rem); mobile bottom sheet (full height, drag handle).
**Accessibility Rules** — `role="dialog" aria-modal` + labelled; focus trap; Esc/backdrop close; return focus to trigger; tabs `role="tablist"`; live region for slot availability.
**Design Tokens** — `.surface-glass` header, `--radius-2xl`, `--brand` selected slot, `--success` available.
**Copywriting (fa)** — «درباره پزشک», «تحصیلات و مدارک», «برنامه و نوبت‌ها», «نظرات بیماران», «گالری و آدرس», «مشاوره آنلاین», «ادامه رزرو», «نظام پزشک», «سال تجربه», «زبان‌ها», «بیمه‌های پذیرفته‌شده».
**Loading States** — Skeleton drawer shell + slot skeleton pills; profile body streams in.
**Empty States** — No slots → «این هفته نوبت خالی نیست» + "ثبت در لیست انتظار" (guest-allowed `JoinWaitingListRequest`).
**Error States** — Slot fetch fail → retry inline; doctor not found → 404 view.
**SEO Recommendations** — Drawer is the **progressive enhancement** of the full `/doctors/[slug]` SEO page (same content); deep-link `?doctor=slug` opens drawer; `Physician` + `AggregateRating` JSON-LD on the full page.
**Interaction Details** — Selecting a date fetches `TimeSlot[]`; selecting a slot writes `{doctorId, date, startTime, endTime}` to the draft and enables «ادامه رزرو»; favorite toggle.
**Visual Hierarchy** — Header (identity) → tabs → schedule (action) → sticky CTA.
**Conversion Strategy** — Schedule + reviews adjacent to CTA; waiting-list fallback captures leads when no slots.

---

### SECTION 7 — Patient Reviews
**UX Objective** — Google-Maps-style verified reviews to build trust.
**Business Objective** — Social proof lifts conversion; responses show care.
**User Needs** — "What do real patients say?", "Is the rating trustworthy?"
**User Journey** — Open Reviews tab → see rating distribution → filter (by rating/keywords) → mark helpful → read doctor's response.
**Information Architecture** — Summary (avg, count, distribution bars) + filter chips + review list (verified badge, stars, text, images, helpful, doctor response).
**Wireframe Description** — Left: big average + 5→1 distribution bars. Right: `ReviewCard` list with filters and "مفید بود؟" buttons; expandable doctor replies.
**Component Tree** — `ReviewsPanel → RatingSummary(AvgRating, RatingDistribution, VerifiedCount) · ReviewFilters · ReviewList(ReviewCard(Author, VerifiedBadge, Stars, Body, Photos, HelpfulButton, DoctorResponse))`.
**Motion Specification** — Distribution bars grow on enter; cards stagger; helpful button micro-pop; filter change cross-fades list.
**Responsive Behaviour** — ≥md 2-col (summary | list); mobile stacked.
**Accessibility Rules** — Stars have `aria-label="۴ از ۵"`; distribution as `<ul>`; helpful is a labelled button with count; images alt text.
**Design Tokens** — `--gold` stars, `--brand-mint` verified badge tint, `--radius-xl`.
**Copywriting (fa)** — «نظرات بیماران», «تأییدشده», «میانگین امتیاز», «مفید بود؟», «پاسخ پزشک», «بر اساس تجربه واقعی».
**Loading States** — Skeleton review cards.
**Empty States** — «هنوز نظری ثبت نشده» (if `ratingCount==0`) + CTA to first review (post-visit).
**Error States** — Load fail → retry.
**SEO Recommendations** — `Review` + `AggregateRating` JSON-LD; verbatim review text indexable; author initials (no PII leaks).
**Interaction Details** — Filter by stars/keyword; sort newest/helpful; helpful increments optimistically.
**Visual Hierarchy** — Average score (display) → distribution → list.
**Conversion Strategy** — Verified badge + volume reduces doubt before booking.

---

### SECTION 8 — Clinic Information
**UX Objective** — Reassure about the physical experience (facilities, access, hours).
**Business Objective** — Reduce no-shows by setting clear expectations.
**User Needs** — "Where is it?", "Is there parking/accessibility?", "When open?", "Emergency?"
**User Journey** — Browse gallery → check hours/emergency numbers → open map/virtual tour.
**Information Architecture** — Gallery (reception, waiting room, facilities, parking, accessibility) + info column (hours, emergency, accessibility, parking) + interactive map.
**Wireframe Description** — Masonry/lightbox gallery; info cards; embedded `ClinicMap` (static fallback); "تور مجازی" CTA.
**Component Tree** — `ClinicInfo → Gallery(Lightbox) · InfoCards(Hours, Emergency, Parking, Accessibility) · ClinicMap · VirtualTourLink`.
**Motion Specification** — Gallery parallax; lightbox zoom-in; map pin drop.
**Responsive Behaviour** — 2-col → 1-col; gallery responsive grid.
**Accessibility Rules** — Gallery images alt; lightbox `role="dialog"` + Esc; map has text address fallback.
**Design Tokens** — `--radius-2xl`, `--shadow-card`, neutral photos.
**Copywriting (fa)** — «پذیرش», «اتاق انتظار», «امکانات», «پارکینگ», «دسترسی ویژه», «ساعات کاری», «اورژانس», «تور مجازی», «آدرس».
**Loading States** — Image blur-up placeholders.
**Empty States** — No photos → address + hours still shown.
**Error States** — Map fail → static address.
**SEO Recommendations** — `MedicalClinic`/`LocalBusiness` + `GeoCoordinates`, `openingHours`, `hasMap`; per-branch `/branches/[slug]`.
**Interaction Details** — Click photo → lightbox; click map → open in maps app.
**Visual Hierarchy** — Gallery imagery dominant; hours/emergency prominent.
**Conversion Strategy** — Access + hours reduce uncertainty; map enables "I can get there".

---

### SECTION 9 — Medical Services
**UX Objective** — Show the breadth of care and connect services to doctors.
**Business Objective** — Cross-sell services; create service SEO pages.
**User Needs** — "Do you offer X?", "How long does it take?", "Any prep?"
**User Journey** — Grid → service card → doctors offering it → book.
**Information Architecture** — Grid of `ServiceCard` (illustration, title, description, doctors offering, est. duration, preparation guide link).
**Wireframe Description** — Soft cards; hover reveals "پزشکان این خدمت".
**Component Tree** — `ServiceGrid → ServiceCard(Illustration, Title, Description, OfferingDoctors, Duration, PrepGuide)`.
**Motion Specification** — Stagger reveal; hover lift.
**Responsive Behaviour** — 3→2→1 cols.
**Accessibility Rules** — Card is a link; illustration decorative.
**Design Tokens** — `--brand-mint` tints, `--radius-2xl`.
**Copywriting (fa)** — «خدمات درمانی», «مدت تقریبی», «راهنمای آمادگی», «پزشکان این خدمت».
**Loading States** — Skeleton cards.
**Empty States** — «به‌زودی خدمات بیشتری».
**Error States** — Fallback list.
**SEO Recommendations** — `/services/[slug]` pages; `MedicalProcedure`/`Offer` schema; link to offering doctors.
**Interaction Details** — Click → service detail / filtered doctors.
**Visual Hierarchy** — Illustration → title → duration.
**Conversion Strategy** — Prep guide reduces no-shows; cross-link to doctors.

---

### SECTION 10 — Insurance Partners
**UX Objective** — Clarify coverage; reduce fee anxiety.
**Business Objective** — Partner exposure; reduce payment drop-off.
**User Needs** — "Is my insurance accepted?", "How much is covered?"
**User Journey** — Logo cloud → search insurer → see coverage note → apply as facet in discovery.
**Information Architecture** — Searchable logo cloud + coverage info + insurance guide link.
**Wireframe Description** — Search box filters logos; selected insurer shows coverage %/note; "راهنمای بیمه" link.
**Component Tree** — `InsuranceSection → InsuranceSearch · InsuranceLogoCloud · CoverageNote · InsuranceGuideLink`.
**Motion Specification** — Logos grayscale→color on hover; search filters with fade.
**Responsive Behaviour** — Wrap grid; search prominent on mobile.
**Accessibility Rules** — Logos as buttons with insurer name; search labelled.
**Design Tokens** — Neutral; `--brand-cyan` accents.
**Copywriting (fa)** — «بیمه‌های همکار», «بیمه خود را جستجو کنید», «راهنمای پوشش بیمه».
**Loading States** — Skeleton logos.
**Empty States** — «بیمه‌ای یافت نشد» + contact.
**Error States** — Fallback list.
**SEO Recommendations** — List accepted insurers in `MedicalClinic`; link to `/branches` coverage.
**Interaction Details** — Select insurer → becomes active facet in §5.
**Visual Hierarchy** — Search → logos.
**Conversion Strategy** — Coverage clarity reduces payment-stage abandonment.

---

### SECTION 11 — Booking Experience Timeline
**UX Objective** — Demystify the end-to-end flow (incl. where OTP/payment happen).
**Business Objective** — Set expectations → fewer drop-offs at auth.
**User Needs** — "What are the steps?", "When do I pay/log in?"
**User Journey** — Read timeline → internalize → feel confident starting.
**Information Architecture** — Horizontal (lg) / vertical (mobile) timeline: Search → Choose doctor → Read reviews → Select date → Select time → Review summary → OTP login → Payment → Confirmed.
**Wireframe Description** — Numbered nodes with icons; connector "draws" on scroll; OTP & Payment nodes visually marked.
**Component Tree** — `BookingTimeline → StepNode(Search, Doctor, Reviews, Date, Time, Summary, OTP, Payment, Confirmed) · AnimatedConnector`.
**Motion Specification** — Connector `stroke-dashoffset` draws with scroll; nodes pop in sequence; OTP/Payment nodes pulse subtly.
**Responsive Behaviour** — Horizontal→vertical stack.
**Accessibility Rules** — Ordered list `<ol>`; each node a `<li>` with text label; decorative connector `aria-hidden`.
**Design Tokens** — `--brand` connector, `--success` confirmed node, `--gold` highlight on OTP/payment.
**Copywriting (fa)** — «جستجو», «انتخاب پزشک», «خواندن نظرات», «انتخاب تاریخ», «انتخاب ساعت», «مرور خلاصه», «ورود با کد یکبار‌مصرف», «پرداخت», «تأیید نوبت».
**Loading States** — Static SSR.
**Empty States** — N/A.
**Error States** — N/A.
**SEO Recommendations** — `HowTo`/`ItemList` steps; keyword-rich step names.
**Interaction Details** — Hover node → short tooltip describing step.
**Visual Hierarchy** — Linear progression; OTP/payment visually distinct.
**Conversion Strategy** — Pre-framing OTP/payment reduces surprise-abandonment.

---

### SECTION 12 — Health Articles
**UX Objective** — Authority/education; SEO acquisition.
**Business Objective** — Organic traffic; trust.
**User Needs** — "Is this clinic knowledgeable?", "Info about my condition."
**User Journey** — Featured + categories → article card → read.
**Information Architecture** — Featured article + category chips + card grid.
**Wireframe Description** — Cards: cover image, category, title, excerpt, reading time, date.
**Component Tree** — `ArticlesSection → CategoryChips · FeaturedArticle · ArticleGrid(ArticleCard)`.
**Motion Specification** — Stagger reveal; hover image zoom.
**Responsive Behaviour** — 3→2→1 cols.
**Accessibility Rules** — Cards are links; images alt; reading time as meta.
**Design Tokens** — `--radius-2xl`, `--shadow-card`.
**Copywriting (fa)** — «مقالات سلامت», «زمان مطالعه», «دسته‌بندی‌ها».
**Loading States** — Skeleton cards.
**Empty States** — «به‌زودی مقالات جدید».
**Error States** — Fallback featured.
**SEO Recommendations** — `/articles/[slug]` with `Article`/`BlogPosting` schema; breadcrumbs; internal links to doctors/services.
**Interaction Details** — Category filter; click → article.
**Visual Hierarchy** — Featured large; grid secondary.
**Conversion Strategy** — Articles end with contextual "یافتن پزشک مرتبط" CTA.

---

### SECTION 13 — FAQ (animated, searchable, categorized)
**UX Objective** — Remove last objections.
**Business Objective** — Reduce support load; lift conversion.
**User Needs** — "What if I need to cancel?", "Is my data private?", "When do I pay?"
**User Journey** — Search/type → grouped accordion → answer.
**Information Architecture** — Search input + result count + categorized accordions (نوبت‌دهی، پرداخت، حساب کاربری، حریم خصوصی، بیمه).
**Wireframe Description** — Centered single column; search filters live; empty-state on no match.
**Component Tree** — `FaqSearchable → FaqSearchInput · FaqCategory(Accordion) · FaqEmptyState`.
**Motion Specification** — Accordion expand (height auto, 220ms); search filter fade.
**Responsive Behaviour** — Single column always.
**Accessibility Rules** — Existing shadcn `Accordion` (keyboard); search labelled; result count `aria-live`.
**Design Tokens** — `--radius-xl`, `--brand` chevron.
**Copywriting (fa)** — «سوالات متداول», «جستجو در سوالات…», empty «نتیجه‌ای پیدا نشد» + «تماس با پشتیبانی».
**Loading States** — Static SSR.
**Empty States** — No match → suggestions + support link.
**Error States** — N/A.
**SEO Recommendations** — `FAQPage` JSON-LD; can win rich results.
**Interaction Details** — Debounced search; persian-normalized matching; deep-link `?q=`.
**Visual Hierarchy** — Search → category → Q/A.
**Conversion Strategy** — Each booking/payment FAQ ends with a relevant CTA.

---

### SECTION 14 — Final CTA (patient-friendly)
**UX Objective** — Encourage the next booking without being salesy.
**Business Objective** — Convert the convinced-but-hesitant.
**User Needs** — "OK, I'm ready — what now?"
**User Journey** — Scroll end → soft gradient band → single clear CTA.
**Information Architecture** — Full-bleed gradient band: short headline + 1 primary CTA + secondary (find a doctor).
**Wireframe Description** — `--gradient-brand` subtle band; calm copy; primary «شروع جستجوی پزشک» / ghost «اولین نوبت خالی».
**Component Tree** — `FinalCta → GradientBand · CTACluster`.
**Motion Specification** — Subtle hue shift on scroll; CTA hover lift+glow.
**Responsive Behaviour** — Centered, padding scales.
**Accessibility Rules** — One H2; CTA descriptive label; contrast verified on gradient.
**Design Tokens** — `--gradient-brand`, `--shadow-glow` on CTA, `--radius-2xl`.
**Copywriting (fa)** — «آماده‌اید visit خود را رزرو کنید؟», primary «یافتن پزشک», ghost «اولین نوبت خالی».
**Loading States** — Static.
**Empty States** — N/A.
**Error States** — N/A.
**SEO Recommendations** — Reinforces primary keyword; internal links.
**Interaction Details** — CTA scrolls to / routes to search.
**Visual Hierarchy** — Headline → CTA.
**Conversion Strategy** — Calm, single decision; ties to resume-draft if present.

---

### SECTION 15 — Footer
**UX Objective** — Complete wayfinding + trust/legal.
**Business Objective** — Retention, SEO, compliance.
**User Needs** — Contact, location, hours, emergency, legal, social.
**User Journey** — Find contact/legal → leave assured.
**Information Architecture** — Columns: Brand+socials | Discover (specialties/doctors/services) | Clinic (branches/hours/emergency) | Resources (articles/FAQ) | Legal. Bottom: emergency strip, language toggle, copyright.
**Wireframe Description** — Multi-column footer; emergency numbers prominent; map mini; social icons.
**Component Tree** — `SiteFooter → FooterColumns× · SocialRow · EmergencyStrip · LegalBar · LanguageToggle`.
**Motion Specification** — Minimal; link hover underline grow.
**Responsive Behaviour** — Columns collapse; accordion columns on mobile.
**Accessibility Rules** — `<footer>`; link list semantics; emergency as `tel:` link.
**Design Tokens** — Neutral/inverted; `--radius-xl`.
**Copywriting (fa)** — «تماس», «آدرس», «ساعات کاری», «اورژانس», «حریم خصوصی», «قوانین و مقررات», «شبکه‌های اجتماعی».
**Loading States** — Static.
**Empty States** — Hide empty columns.
**Error States** — Fallback contact.
**SEO Recommendations** — Sitemap links, privacy/terms, `ContactPoint` in `MedicalOrganization`.
**Interaction Details** — `tel:`/`mailto:` links; map deep-link.
**Visual Hierarchy** — Emergency > columns > legal.
**Conversion Strategy** — Emergency/contact reduce friction for urgent intent.

---

## D. Booking Flow Micro-Spec (state machine)

```
search ──► doctor ──► datetime ──► summary ──► (auth?) ──► pay ──► done
   ▲          │           │           │            │         │
   └──────────┴───────────┴───────────┴────────────┴─────────┘
                  BookingDraft persisted (zustand + localStorage)
```
- **Pre-auth steps** capture into the draft (doctor/branch/service/date/time/insurance/coupon/referral/notes).
- **auth?** — only if `authStore.user == null`. Stores `resumeTo=/booking`; OTP → resume hook `commit()` → `bookAppointment` → `payVisitFee`.
- **Back/forward** restores from draft at every step (step indicator `BookingStepper` reflects `draft.step`).
- **Re-entry** (reload/return) — draft TTL-valid → banner «ادامه رزرو ناقص دارید» with «ادامه»/«انصراف».

## E. Edge & conflict handling
- **E1 slot taken (race):** conflict UI + 3 nearest slots; draft preserved.
- **E2 OTP fail/locked:** existing `useOtpFlow` phases (counting/expired/locked); draft untouched; retry in place.
- **E3 payment fail/insufficient:** `payVisitFee` throws → route to wallet top-up; appointment stays `PENDING`; draft `step="pay"`.
- **E4 draft expired (>24h):** banner «نشست شما منقضی شد» → restart.
- **E5 offline (PWA):** discovery cached (mock/ISR); booking write deferred until online.

## F. Implementation Roadmap
| Phase | Scope | Exit |
|---|---|---|
| 0 — Tokens & primitives | Emerald/Teal/Mint ramp, shadows, type scale, `.surface-*`, motion presets; atoms (`StatCounter`, `QuickFilterChip`, `VerifiedBadge`, `RatingDistribution`). | Dark/RTL/a11y pass. |
| 1 — Booking session | `bookingSession` store + `useBookingSession` + `useResumeAfterLogin` + conflict handling. | Draft survives reload + OTP. |
| 2 — Search & discovery | `IntelligentSearchBar`, `/doctors` SSR + facets + sort + mock toggle. | Indexable, empty/loading/error OK. |
| 3 — Doctor & reviews | `DoctorCard`, `DoctorProfileDrawer`, `/doctors/[slug]` SEO, reviews (schema). | Physician+Review JSON-LD. |
| 4 — Calendar & slots | `BookingCalendar` (Jalali) + `TimeSlotGrid` + draft write. | Slot→draft→resume→book→pay. |
| 5 — Clinic/insurance/services/articles | All supporting sections + `/branches`, `/services`, `/articles` SEO. | LocalBusiness/Article schema. |
| 6 — CRO & a11y & perf | Final CTA, FAQ schema, Lighthouse ≥95, full keyboard/RTL, reduced-motion. | Quality gate green. |

## G. Open decisions (confirm before build)
1. **Payment provider** for `payVisitFee` (currently simulated via [`PaymentSimulatorDialog`](../src/components/payment/PaymentSimulatorDialog.tsx)) — gate before "pay" step.
2. **Backend readiness** for patient-facing doctor fields (rating, fee, avatar) — confirm to drop `USE_MOCK`.
3. **Virtual tour** hosting for §8.
4. **Reviews** moderation — implemented: statuses `PENDING` | `APPROVED` | `REJECTED`; one review per completed appointment; public summary from approved only; admin moderates; doctor replies only when approved. Frontend `USE_MOCK` in `lib/review-api.ts` defaults to live API.
5. **Insurance coverage API** for §10 facet + coverage notes.
6. **Favorites persistence** for unauth users (local-only vs requires account).

> This document is the implementation contract. PRs reference section letters/numbers (e.g. *"implements §B.2 resume hook"*).
