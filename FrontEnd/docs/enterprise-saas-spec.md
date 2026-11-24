# Clinick — Enterprise Healthcare SaaS Landing Page
## Product Design Specification (PDS)

> **Document status:** Spec-only (Phase 0). No production code in this document.
> **Audience:** Senior frontend engineers, design systems, motion, a11y, SEO.
> **Stack of record:** Next.js 16 (App Router) · React 19 · TypeScript · TailwindCSS v4 · shadcn · **GSAP + Lenis** (installed motion core) · `tw-animate-css` · recharts · zustand · @tanstack/react-query · lucide-react · sonner. RTL-first, Persian (`fa`) primary locale.
> **Design north star:** *"Within 5 seconds, a clinic owner must understand this is an Enterprise Healthcare Operating System — not another clinic website."*

---

## 0. How to read this document

This PDS is the **single source of truth** that lets an engineer implement the landing page without making design decisions. It is organized so you can navigate **horizontally** (by concern: tokens, motion, a11y, SEO) and **vertically** (by page section: 1→17).

- Every visual decision has a **token name** you can grep.
- Every interaction has a **trigger → state → motion → a11y** breakdown.
- Every section has a **wireframe (ASCII), copy scaffold, component tree, and conversion intent**.
- Folder/file names are **prescriptive**, not illustrative.

> **Motion engine note:** the brief requested Framer Motion. The installed, production-validated motion core in this repo is **GSAP (ScrollTrigger) + Lenis + `tw-animate-css`** (see `FrontEnd/package.json`). To stay within the existing, tuned smooth-scroll pipeline and avoid a second motion runtime, this spec standardizes on **GSAP + Lenis**. A 1:1 mapping to Framer Motion variants is provided in §8.6 for teams that prefer it; either path is acceptable, but **do not ship both**.

---

## 1. UX Strategy

### 1.1 Strategic frame
The current public site (`MarketingHome`) is a **clinic website** — it markets *a clinic*. Clinick is **not a clinic**; it is the **software that runs clinics**. The landing page must reframe the visitor's mental model from *"where do I book?"* → *"what runs my entire operation?"*.

### 1.2 The 5-second test (must pass)
On first paint, the viewport must communicate, in order of cognitive weight:
1. **Category** → "Healthcare Operating System" (headline + product wordmark).
2. **Scope** → four personas/roles (Patient · Doctor · Reception · Admin) visible as living dashboard tiles.
3. **Proof** → a trust bar with hard numbers (clinics, doctors, appointments, uptime).
4. **Motion** → a live, breathing product UI (queue ticking, revenue counting) so it reads as *software*, not marketing.

### 1.3 Five questions every section answers (UX contract)
| Question | Answered by | Mechanism |
|---|---|---|
| **What is this?** | Eyebrow + H2 | One-line category label + benefit headline |
| **Why trust it?** | Proof cluster | Logos, verified badges, counters, uptime SLA |
| **Why is it better?** | Differentiator strip | "vs. status quo" micro-comparison |
| **How does it work?** | Workflow viz | Timeline / tabbed product window / numbered steps |
| **How do I start?** | Primary CTA | Persistent, contextual ("Request Demo" / "Start Free Trial") |

### 1.4 Persona journey mapping
| Persona | Entry emotion | Hero hook | Must-see section | Exit CTA |
|---|---|---|---|---|
| Clinic Owner | "Is this enterprise-grade?" | Operating-system framing + revenue | §10 Admin, §11 Intelligence | Request Demo |
| Doctor | "Will this save me time?" | Productivity tiles | §8 Doctor Productivity | Start Free Trial |
| Receptionist | "Will the queue be easier?" | Live queue tile | §9 Reception | Book a Consultation |
| Investor | "Is there scale + moat?" | Trust bar + numbers | §3 Trusted By, §11 Intelligence | Contact Sales |
| Patient (secondary) | "Is it convenient?" | Patient tab | §4 Product Showcase (Patient) | Patient Portal |

### 1.5 Cognitive load principles
- **One idea per scroll-fold.** Never more than 1 H2 + 1 visual + 1 CTA cluster in view.
- **Progressive disclosure.** Tabs (§4) and accordions (§15) hide depth until requested.
- **Recognizable metaphors.** Dashboards look like the *real* product UIs, so visitors pre-trust the app.
- **Reduce, then reward.** Every feature section leads with the *time saved*, then the capability.

---

## 2. Information Architecture

The page is a **scroll-narrated product story** in 17 scenes, grouped into 5 narrative arcs:

```
ARC A — ORIENT (who is this for, what is it)
  §1  Sticky Glass Navigation
  §2  Hero (Operating-System reveal)
  §3  Trusted By (proof bar)

ARC B — DEMONSTRATE (show the whole platform, end to end)
  §4  Interactive Product Showcase (4-role tabs)
  §5  Clinic Workflow (end-to-end timeline)
  §6  Feature Experience (alternating story blocks)

ARC C — GO DEEP (one block per persona/flow)
  §7  Prescription Experience
  §8  Doctor Productivity
  §9  Reception Dashboard
  §10 Admin Dashboard
  §11 Platform Intelligence
  §12 Security & Compliance

ARC D — REASSURE (quality signals)
  §13 Responsive / PWA
  §14 Testimonials

ARC E — ACT (convert)
  §15 FAQ (objection handling)
  §16 Final CTA
  §17 Enterprise Footer
```

### 2.1 Section registry (canonical order + anchors)
| § | Component name | `id` anchor | Primary KPI it serves |
|---|---|---|---|
| 1 | `StickyNav` | `#top` | Navigation, demo CTR |
| 2 | `HeroOperatingSystem` | `#home` | Hero engagement, demo CTR |
| 3 | `TrustBar` | `#trusted-by` | Trust, scroll-through |
| 4 | `RoleShowcase` | `#platform` | Tab interaction rate |
| 5 | `WorkflowTimeline` | `#workflow` | Time-on-section |
| 6 | `FeatureStoryGrid` | `#features` | Feature deep-links |
| 7 | `PrescriptionExperience` | `#prescriptions` | Prescription CTA |
| 8 | `DoctorProductivity` | `#doctors` | Doctor trial signups |
| 9 | `ReceptionDashboard` | `#reception` | Reception interest |
| 10 | `AdminDashboard` | `#admin` | Enterprise demo requests |
| 11 | `PlatformIntelligence` | `#intelligence` | Differentiation |
| 12 | `SecurityCompliance` | `#security` | Enterprise trust |
| 13 | `ResponsivePwa` | `#everywhere` | Mobile confidence |
| 14 | `Testimonials` | `#stories` | Social proof |
| 15 | `FaqSearchable` | `#faq` | Objection removal |
| 16 | `FinalCta` | `#start` | Conversion (primary) |
| 17 | `EnterpriseFooter` | `#footer` | Retention, SEO |

> **Mapping to current `MarketingHome`:** the present `About/Services/Doctors/Amenities/Articles` clinic sections are **retired** from the SaaS landing page (kept available via feature flag for any single-clinic tenant later). `Stats→TrustBar`, `Process→WorkflowTimeline`, `Features→FeatureStoryGrid`, `Testimonials→Testimonials`, `Faq→FaqSearchable`, `FinalCta→FinalCta` are **evolved, not deleted**.

---

## 3. Visual Hierarchy

### 3.1 Hierarchy model (weight budget)
A strict **3-level** type hierarchy per section, so the eye always knows the destination:

| Level | Role | Token | When |
|---|---|---|---|
| **Display** | Hero / section-closer H1, H2 | `text-display-xl`, `text-display-lg` | Once per fold |
| **Title** | Card / block H3 | `text-title-lg` | Multiple per row |
| **Body** | Description, labels | `text-body-lg`, `text-body` | Paragraphs |
| **Micro** | Eyebrows, badges, meta | `text-eyebrow`, `text-meta` | Chipped labels |

### 3.2 The "anchor eye-path" per section
`Eyebrow chip → H2 headline → (optional) gradient-highlight phrase → 1-line promise → visual + 1 CTA`.
Visitors who skim read only eyebrows + H2s and still get the full story.

### 3.3 Density & whitespace rules
- **Section padding:** `clamp(4rem, 8vw, 7rem)` vertical (existing `.marketing-section`, widened at top end).
- **Inter-element:** 8px grid; never use odd values. Gaps scale `gap-2 → gap-4 → gap-6 → gap-10 → gap-16`.
- **Card internal padding:** `p-5 sm:p-6 lg:p-8`.
- **Container:** `max-w-[80rem]` (1280px) centered, gutters `px-5 sm:px-8 lg:px-10`.

### 3.4 Color-as-hierarchy
- **Brand teal** = only for *primary actions* and *active states* (rare = loud).
- **Neutral slate** = 90% of the UI (calm, premium).
- **Gold** = *one* micro-accent per section max (verified badges, premium cues).
- **Semantic** (success/cyan/mint) = data viz + status only (queue, revenue, uptime).

---

## 4. Design Tokens

> All tokens are OKLCH, defined once in `globals.css`, exposed to Tailwind via `@theme inline` (existing pattern). **No hex anywhere.** Extend, don't fork, the current token set.

### 4.1 Color tokens (evolution toward Emerald/Teal/Mint)
The brief asks for Emerald/Teal/Mint + neutral + soft cyan/success. Current `--brand` is teal `oklch(0.51 0.095 187)`. We **introduce a 3-stop brand ramp** (emerald → teal → mint) while keeping `--brand` as the action color.

```css
:root {
  /* Brand ramp — Emerald/Teal/Mint (NEW) */
  --brand-emerald: oklch(0.58 0.13 165);  /* deep emerald — primary gradient start */
  --brand-teal:    oklch(0.51 0.095 187); /* = --brand (unchanged) — actions */
  --brand-mint:    oklch(0.86 0.05 170);  /* soft mint — tints, glows */
  --brand-cyan:    oklch(0.78 0.10 200);  /* soft cyan — accents, data */
  --success:       oklch(0.62 0.14 150);  /* success green — status */

  /* Gradient presets (NEW, semantic) */
  --gradient-brand: linear-gradient(135deg,
    var(--brand-emerald), var(--brand-teal) 55%, var(--brand-cyan));
  --gradient-hero-glow: radial-gradient(ellipse 70% 60% at 50% -10%,
    color-mix(in oklch, var(--brand-teal) 16%, transparent), transparent 60%);

  /* Existing tokens retained: --brand, --brand-foreground, --brand-muted,
     --gold, surfaces, semantic, chart-1..5, sidebar* */
}
```
| Token | Light | Dark | Use |
|---|---|---|---|
| `--brand-teal` | `0.51 0.095 187` | `0.72 0.11 187` | Primary buttons, active tab, focus ring |
| `--brand-emerald` | `0.58 0.13 165` | `0.70 0.13 165` | Gradient hero, CTAs on glass |
| `--brand-mint` | `0.86 0.05 170` | `0.34 0.05 170` | Tile tints, soft glows |
| `--brand-cyan` | `0.78 0.10 200` | `0.78 0.10 200` | Data accents, links |
| `--gold` | `0.82 0.12 84` | `0.86 0.13 86` | Verified badge only |
| `--success` | `0.62 0.14 150` | `0.70 0.15 150` | Queue "checked in", uptime |

### 4.2 Typography tokens
- **Family:** `Vazirmatn` (self-hosted, `font-vazir`), 400–800. Latin fallback Geist via `--font-geist-sans`.
- **Monospace:** `--font-mono` for code/metric numerals.
- **Scale (fluid, clamp):**
  | Token | Clamp | Usage |
  |---|---|---|
  | `--text-display-xl` | `clamp(2.5rem, 6vw, 4.5rem)` | Hero H1 |
  | `--text-display-lg` | `clamp(2rem, 4.4vw, 3.25rem)` | Section H2 |
  | `--text-title-lg` | `clamp(1.35rem, 2.4vw, 1.875rem)` | Card H3 |
  | `--text-body-lg` | `1.125rem / 1.7` | Lead paragraph |
  | `--text-body` | `1rem / 1.65` | Default |
  | `--text-eyebrow` | `0.8rem, 600, 0.14em` | Section eyebrow (uppercase, tracked) |
  | `--text-meta` | `0.8125rem` | Meta, captions |
- **Persian numerals:** use `toLocaleString('fa-IR')` for all counters/dates (existing `AnimatedCounter` pattern).

### 4.3 Spacing, radius, elevation
- **Grid:** 12-col, 8px base. Gutter `1.5rem` (24px). Section padding `clamp(4rem,8vw,7rem)`.
- **Radius:** `--radius: 0.875rem` base; scale `sm(0.525)→md(0.7)→lg(0.875)→xl(1.225)→2xl(1.575)→3xl(1.925)→4xl(2.275)`. **Hero/dashboard windows use `2xl`–`3xl`.**
- **Elevation (shadows):**
  - `--shadow-soft`: `0 1px 2px rgba(15,23,42,.04), 0 8px 24px -12px rgba(15,23,42,.12)`
  - `--shadow-card`: `0 2px 4px rgba(15,23,42,.05), 0 24px 48px -24px rgba(15,23,42,.18)`
  - `--shadow-float`: `0 30px 80px -30px rgba(15,23,42,.35)` (floating hero tiles, hover lift)
  - `--shadow-glow`: `0 0 0 1px color-mix(in oklch,var(--brand-teal) 30%,transparent), 0 12px 40px -12px color-mix(in oklch,var(--brand-teal) 40%,transparent)`
- **Borders:** `1px solid var(--border)`; hairline rings via `ring-1 ring-border`.

### 4.4 Glass & surfaces
- Reuse/extend `.marketing-glass`. Add named utilities:
  - `.surface-glass` (header, mega menu, floating tiles): `blur(18px) saturate(160%)`, `bg color-mix(card 70%/transparent)`.
  - `.surface-card`: solid `--card`, `1px border`, `--shadow-card`.
  - `.surface-inset`: recessed muted panel (`bg-muted`) for dashboard canvases.

### 4.5 Motion tokens (duration / easing)
| Token | Value | Use |
|---|---|---|
| `--ease-out-soft` | `cubic-bezier(0.22, 1, 0.36, 1)` | Default (Linear/Vercel feel) |
| `--ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | Tab cross-fades |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Tile pop, CTA press |
| `--dur-instant` | `120ms` | Hover micro-states |
| `--dur-fast` | `220ms` | Toggles, badges |
| `--dur-base` | `420ms` | Reveals, tab content |
| `--dur-slow` | `700ms` | Hero entrance, parallax settle |

### 4.6 z-index contract
| Layer | z |
|---|---|
| Ambient mesh/noise | `-10` |
| Content | `0–10` |
| Floating hero tiles | `20` |
| Sticky nav | `50` |
| Mega menu / dropdown | `60` |
| Sheet (mobile nav) | `70` |
| Toast (sonner) | `100` |
| Command palette (⌘K) | `90` |
| Skip link focus | `110` |

---

## 5. Wireframe Structure (per section)

> ASCII is **desktop ≥ lg** unless noted. All collapse to single column on mobile in the same reading order. `▸` = CTA, `▣` = dashboard tile, `◍` = icon.

### §1 Sticky Glass Navigation
```
┌──────────────────────────────────────────────────────────────────┐
│ [Logo Clinick]   Platform▾  Solutions▾  Resources▾        │ ◍ ◍ │ ▸Login │ ▸Dashboard │ ▸Request Demo │
└──────────────────────────────────────────────────────────────────┘
   glass blur · on scroll: height 72→64px, border-bottom fades in
   mega menu opens on hover/focus (Platform/Solutions); mobile → Sheet + ⌘K
```

### §2 Hero — Operating System reveal
```
┌──────────────────────────────────────────────────────────────────┐
│                          [eyebrow: HEALTHCARE OS]                 │
│            The Operating System for Modern Clinics                │
│        One platform. Four dashboards. Zero paperwork.             │
│       [▸ Start Free Trial]  [▸ Request Demo]   trust chips        │
│                                                                    │
│   ┌──────────────────── DESKTOP DASHBOARD ────────────────────┐   │
│   │ sidebar │ live queue · revenue · calendar · notifications  │   │
│   └──────────────────────────────────────────────────────────┘   │
│   ▣ tablet   ▣ mobile   ▣ rx card   ▣ wallet card (floating)     │
│   ambient hero glow · parallax tiles · counting metrics          │
└──────────────────────────────────────────────────────────────────┘
```

### §3 Trusted By
```
┌──────────────────────────────────────────────────────────────────┐
│  [logo] [logo] [logo] [logo] [logo] [logo]   (grayscale → color) │
│ ───────────────────────────────────────────────────────────────── │
│  120+ clinics │ 2,400 doctors │ 1.8M appointments │ 99.98% uptime │
│   (animated counters, Persian numerals)        security badges ◍ │
└──────────────────────────────────────────────────────────────────┘
```

### §4 Interactive Product Showcase (tabs)
```
┌──────────────────────────────────────────────────────────────────┐
│     One platform · four experiences                               │
│  [Patient] [Doctor] [Reception] [Admin]   ← role tabs             │
│ ┌──────────────────────┐   ┌──────────────────────────────────┐  │
│ │  active dashboard    │   │ H3 persona promise               │  │
│ │  (changes per tab)   │   │ • benefit • benefit • benefit    │  │
│ │                      │   │ metric strip                      │  │
│ └──────────────────────┘   │ [▸ See it live]  [▸ Free Trial]  │  │
│                            └──────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### §5 Clinic Workflow (timeline)
```
Book → Confirm → Consult → SOAP → Prescribe → Pay → Notify → Analyze → Report
  ●─────────●─────────●─────────●─────────●─────────●─────────●─────────●─────────●
animated connector "draws" as you scroll; each node = icon + label + micro-detail
```

### §6 Feature Experience (alternating story blocks)
```
Block A (media left):       Block B (media right):
┌──────────┐  eyebrow        eyebrow        ┌──────────┐
│ dashboard│  H3 headline    H3 headline    │ dashboard│
│  preview │  promise        promise        │  preview │
│          │  • bullet       • bullet       │          │
│          │  metric + CTA   metric + CTA   │          │
└──────────┘                                └──────────┘
```

### §7 Prescription Experience
```
[SOAP] → [search medicine ⌕] → [favorites ★] → [build Rx] → [PDF export] → [notify patient]
left: stacked step cards        right: live prescription builder mockup
```

### §8–§10 Persona dashboards (shared layout)
```
┌──────────────────────┬────────────────────────────┐
│ persona H2 + promise │  full dashboard window      │
│ KPI row (4)          │  (live mini-charts, recharts)│
│ feature chips        │                             │
│ [▸ Primary CTA]      │                             │
└──────────────────────┴────────────────────────────┘
```
- §8 Doctor: Calendar · Queue · Today's patients · Revenue · Records · Smart search
- §9 Reception: Live queue · Walk-ins · Phone reservations · Waiting list · Timeline · Check-in
- §10 Admin: Revenue · Branches · Doctors · Permissions · Reports · Growth charts

### §11 Platform Intelligence
```
3×2 capability grid (Automation, Smart Scheduling, Conflict Detection,
Analytics, Offline, Role Security) — icon tiles with hover reveal
```

### §12 Security & Compliance
```
2-col: left = compliance shield art + badges; right = capability list
(JWT, Encryption, RBAC, Audit, Privacy, Availability SLA)
```

### §13 Responsive / PWA
```
device triptych (desktop · tablet · mobile) + PWA install card + offline badge
parallax: devices float at different scroll speeds
```

### §14 Testimonials
```
3-col cards: clinic logo · verified badge · quote · stars · person (avatar+role)
+ 1 featured video testimonial tile (play overlay)
```

### §15 FAQ (searchable)
```
search input → grouped accordions (Product, Billing, Security, Onboarding, Technical)
result count + empty-state when no match
```

### §16 Final CTA
```
full-bleed gradient band (--gradient-brand)
   H2: "Run your clinic on Clinick"
   [▸ Start Free Trial]  [▸ Request Demo]  [▸ Book Consultation]
```

### §17 Enterprise Footer
```
brand+socials | Platform | Solutions | Resources | Company | Legal
security/uptime strip · language toggle · copyright
```

---

## 6. Component Tree

Atomic architecture: **atoms → molecules → organisms → sections → shell**. Names are PascalCase, one component per file, co-located index barrel optional.

```
<EnterpriseLanding>                         // composition root
├─ <SmoothScroll>                           // Lenis + GSAP ticker (existing)
│   └─ <MarketingShell>                     // ambient mesh/noise + skip-link
│       ├─ <StickyNav>
│       │   ├─ atoms: BrandMark, NavLink, GhostButton, PrimaryButton
│       │   ├─ <MegaMenu> (Platform, Solutions)
│       │   ├─ <ThemeToggle> (existing)
│       │   ├─ <CommandTrigger> → <CommandPalette> (⌘K)
│       │   └─ <MobileNavSheet> (existing Sheet)
│       ├─ <HeroOperatingSystem>
│       │   ├─ <EyebrowChip>, <GradientHeadline>, <CTACluster>
│       │   ├─ <HeroDashboardDesktop>  // the "alive" product window
│       │   │   ├─ <DashSidebar>, <DashTopbar>
│       │   │   ├─ <LiveQueueWidget>, <RevenueWidget>, <CalendarWidget>
│       │   │   ├─ <NotificationToast> (sonner-driven)
│       │   │   └─ <MetricPill> (AnimatedCounter)
│       │   └─ <FloatingDevices>  // tablet, mobile, rx card, wallet card
│       ├─ <TrustBar>
│       │   ├─ <LogoMarquee>, <StatCounter>×4, <SecurityBadges>
│       ├─ <RoleShowcase>
│       │   ├─ <RoleTabs> (Patient/Doctor/Reception/Admin)
│       │   ├─ <RoleDashboardPanel> (switches content)
│       │   └─ <RoleCopyPanel>
│       ├─ <WorkflowTimeline>
│       │   └─ <WorkflowNode>×9 + <AnimatedConnector>
│       ├─ <FeatureStoryGrid>
│       │   └─ <FeatureStoryBlock>×N (alternating, media left/right)
│       ├─ <PrescriptionExperience>
│       │   ├─ <PrescriptionSteps>, <PrescriptionBuilderMock>
│       ├─ <DoctorProductivity> → <PersonaDashboard variant="doctor">
│       ├─ <ReceptionDashboard>  → <PersonaDashboard variant="reception">
│       │   └─ <LiveQueueMock> (ticking rows)
│       ├─ <AdminDashboard>      → <PersonaDashboard variant="admin">
│       │   └─ <GrowthChart> (recharts area), <BranchTable> (Table)
│       ├─ <PlatformIntelligence>
│       │   └─ <IntelligenceTile>×7
│       ├─ <SecurityCompliance>
│       │   ├─ <ComplianceShield>, <SecurityCapabilityList>
│       ├─ <ResponsivePwa>
│       │   └─ <DeviceTriptych>, <PwaInstallCard>
│       ├─ <Testimonials>
│       │   ├─ <TestimonialCard>×N, <VideoTestimonial>
│       ├─ <FaqSearchable>
│       │   ├─ <FaqSearchInput>, <FaqGroup> (Accordion), <FaqEmptyState>
│       ├─ <FinalCta>
│       │   └─ <GradientBand>, <CTACluster variant="hero">
│       └─ <EnterpriseFooter>
│           ├─ <FooterColumn>×5, <SocialRow>, <UptimeStrip>
│       └─ <CustomCursor> (existing, desktop-only)
```

---

## 7. UI Patterns Library

Reusable, documented patterns (all RTL-safe):

| Pattern | Component | Notes |
|---|---|---|
| Eyebrow chip | `<EyebrowChip>` | uppercase, tracked, dot prefix |
| Gradient headline phrase | `<GradientHeadline>` | highlight ≤ 3 words |
| CTA cluster | `<CTACluster variant>` | primary + ghost + link |
| Dashboard window | `<DashWindow>` | faux app chrome: traffic dots, titlebar, sidebar |
| Stat counter | `<StatCounter>` | viewport count-up, `fa-IR` numerals |
| Badge | `<Badge variant>` | success/info/gold/outline |
| Tab (role) | `<RoleTabs>` | animated active pill, `layoutId` underline |
| Timeline node | `<WorkflowNode>` | numbered/icon, animated connector |
| Story block | `<FeatureStoryBlock>` | media slot + copy slot, flip on odd |
| Tile (intelligence) | `<IntelligenceTile>` | icon + title + hover reveal detail |
| Accordion | shadcn `Accordion` | single-open FAQ groups |
| Table | shadcn `Table` | admin branches/doctors |
| Chart | recharts wrappers | `<GrowthChart>`, `<RevenueArea>`, `<QueueMiniBar>` |
| Toast | `sonner` | live notifications in hero dashboard mock |
| Skeleton | shadcn `Skeleton` | loading state for async tiles |
| Command palette | `cmdk`-style | ⌘K quick nav + actions |
| Calendar | existing `jalali-calendar` | doctor/admin scheduling previews |

---

## 8. Motion Specification

> Engine: **GSAP ScrollTrigger + Lenis** (existing `SmoothScroll`/`Reveal`/`TextReveal`/`AnimatedCounter`). Respect `prefers-reduced-motion` everywhere (existing pattern: content is never hidden via CSS).

### 8.1 Motion principles
1. **Alive, not busy.** One ambient loop + scroll-triggered reveals per section.
2. **Cause → effect.** Every motion maps to meaning (counter going up = growth).
3. **Subtle parallax.** Depth via 2–3 layers, max ±24px translate.
4. **Hardware-friendly.** Animate `transform`/`opacity` only.

### 8.2 Scroll-reveal variants (extend existing `Reveal`)
`fade-up` · `blur-in` · `scale-in` · `mask-up` · `slide-start` · `slide-end`.
Defaults: `y: 24px`, `opacity 0→1`, `--dur-base`, stagger `0.08s`.

### 8.3 Section-level choreography
| Section | Motion |
|---|---|
| Hero | Headline `mask-up` (word) → CTAs `fade-up` stagger → dashboard `scale-in` + glow sweep → tiles float (`marketing-float` ambient) |
| TrustBar | Logos marquee (CSS, `prefers-reduced-motion` → static) · counters on enter |
| RoleShowcase | Tab change: outgoing `opacity 0 / y -8` 180ms, incoming `opacity 1 / y 8→0` 260ms `--ease-out-soft` |
| Workflow | Connector `stroke-dashoffset` draws as each node enters; nodes pop `scale 0.8→1` spring |
| FeatureStory | Media parallax `y ±16px`; bullets stagger `fade-up` |
| LiveQueue | Rows tick every 2.5s (state machine), newest row highlight `--dur-fast` |
| Charts | recharts `isAnimationActive` with `animationDuration` 700ms on enter |
| FinalCta | Gradient band subtly shifts hue on scroll (±8deg) |

### 8.4 Micro-interactions
| Trigger | Effect | Dur/Ease |
|---|---|---|
| Button hover | lift `-2px`, `shadow-glow`, bg lighten | `--dur-instant / --ease-out-soft` |
| Button press | scale `0.97` | `120ms / --ease-spring` |
| Card hover | `-translate-y-1`, `shadow-card→shadow-float` | `220ms` |
| Tab hover | underline grow width | `180ms` |
| Mega menu open | height+opacity, origin top | `220ms / --ease-out-soft` |
| Tooltip | fade+`y 4→0` | `150ms` |
| Cursor ring | lag-follow, magnify on interactive (existing) | spring |

### 8.5 Reduced motion
- `@media (prefers-reduced-motion: reduce)`: disable Lenis (native scroll), set all reveals to instant, freeze counters at final value, stop float/marquee. **Never hide content.**

### 8.6 Framer Motion mapping (optional alternative path)
If a team prefers Framer Motion: `Reveal→<motion.div initial/whileInView>`, `TextReveal→staggerChildren`, tab switch→`<motion.div>` with `AnimatePresence` + `layoutId` underline, `marketing-float→animate repeat Infinity`. Same durations/easings from §4.5. **Pick one engine; do not mix.**

---

## 9. Interaction Details

### 9.1 Sticky nav lifecycle
1. **Top:** full height (72px), transparent glass, all nav items visible.
2. **Scrolled > 40px:** shrink to 64px, add `border-b` + stronger blur, hide announcement if present.
3. **Hover/focus Platform|Solutions:** mega menu opens (keyboard: focus moves in, Esc closes, arrow nav).
4. **⌘K / Ctrl+K:** command palette (jump to section, Request Demo, theme toggle, docs).
5. **Mobile < lg:** collapse to `[Logo] [⌘K icon] [☰]`; ☰ opens `<MobileNavSheet>` with nav + CTAs + theme.

### 9.2 Role showcase tab engine
- Tabs are `role="tablist"`; panels `role="tabpanel"`, `aria-labelledby`.
- Keyboard: `←/→` (RTL: `→/←`) cycles tabs; `Home/End` jump.
- Active tab swaps `<RoleDashboardPanel>` content (4 variants) + `<RoleCopyPanel>`.
- URL hash sync optional: `#platform?role=doctor`.

### 9.3 Live queue state machine (hero + reception mock)
A small deterministic mock loop (client-only, reduced-motion → static):
- States: `WAITING → CHECKED_IN → IN_ROOM → DONE`.
- Every 2.5s advance one row; toast on `CHECKED_IN`.
- Persian names from a fixed seed array (no PII).

### 9.4 FAQ search
- Input filters items by query (normalize Persian via existing `normalizer` concepts / simple diacritics strip).
- Group accordion collapses non-matching; show result count; **empty state** when 0 matches (see §11.1).

### 9.5 CTA destination contract
| CTA | Destination | Notes |
|---|---|---|
| Request Demo | `/demo` (or Calendly/external) | Primary enterprise path |
| Start Free Trial | `/signup` | Self-serve |
| Book Consultation | `/contact` or `/demo?type=sales` | Sales |
| Patient Portal | existing `/login` (patient) | Secondary |
| Dashboard | `/login` (auto role redirect) | Existing |

---

## 10. Empty / Loading / Error States

> Applies to interactive tiles (FAQ search, command palette, demo-request forms, live queue mocks, async CMS tiles).

### 10.1 Empty states
- **FAQ no match:** icon `SearchX`, copy *"نتیجه‌ای پیدا نشد"* + suggestion chips (top 3 categories) + "تماس با پشتیبانی" link.
- **Command palette empty:** "هیچ دستوری مطابق نیست" + hint rows.
- **Demo form not started:** inline helper text + required-field hints; never a blank box.

### 10.2 Loading states
- **Above-the-fold:** SSR/SSG — no skeletons; critical content is static HTML.
- **Below-the-fold / async tiles:** shadcn `Skeleton` blocks matching final layout (no layout shift). CMS tiles use React Query `isLoading` → skeleton.
- **Counters:** render final value immediately if reduced-motion; else count up on enter.
- **Charts:** skeleton block → fade in data on enter.

### 10.3 Error states
- **CMS unreachable:** graceful fallback to local Persian content (existing `fallback-content.ts` pattern). Never a broken hero.
- **Form submit error:** inline `destructive` message + field-level error, `aria-invalid`, focus first invalid field. Toast (`sonner`) for transient errors.
- **Asset fail:** `next/image` blur placeholder; alt text always present.

---

## 11. Animation Timeline (global)

Single timeline of what the user sees in the **first viewport + scroll**:

| t (s) | Event |
|---|---|
| 0.0 | Page paint: ambient mesh, eyebrow chip visible (static, a11y-safe) |
| 0.1 | Headline `mask-up` begins (word stagger) |
| 0.6 | Sub-paragraph + trust chips `fade-up` |
| 0.9 | CTA cluster `fade-up` (stagger 80ms) |
| 1.1 | Dashboard window `scale-in` + glow sweep |
| 1.4 | Floating devices/tiles enter (`fade-up` + float loop begins) |
| 1.8 | First hero notification toast appears (sonner) |
| scroll→TrustBar | Logo marquee starts; counters begin on enter |
| scroll→RoleShowcase | Default "Patient" panel revealed; tabs interactive |
| scroll→Workflow | Connector draws node-by-node with scroll progress |
| scroll→FinalCta | Gradient hue shift tied to scroll |

> All `t` values are upper bounds; reduced-motion collapses entrance to **0s (instant)**.

---

## 12. Component Naming Conventions

- **Components:** PascalCase, intent-first (`RoleShowcase`, `LiveQueueWidget`). Avoid generic suffixes (`Section`, `Block`) unless part of a set (`FeatureStoryBlock`).
- **Files:** match component name, one default/named export per file. `RoleShowcase.tsx`.
- **Hooks:** `use<Role/Behavior>` (`useRoleTabs`, `useLiveQueueMock`).
- **Tokens:** `--<scope>-<role>` (`--brand-teal`, `--shadow-card`).
- **Utilities:** camelCase (`cn` existing). CSS utilities prefixed `.marketing-*` or `.surface-*`.
- **Sections barrel:** `sections/index.ts` exports all for composition + feature flags.
- **Icons:** lucide-react only; wrapped via existing `Icon` registry for consistent sizing.

---

## 13. Folder Structure

> Prescriptive layout under `FrontEnd/src`. Extends the current `components/marketing` tree.

```
src/
├─ app/
│  ├─ (marketing)/                // route group for the SaaS landing page
│  │  ├─ layout.tsx               // metadata, RTL, fonts, Providers
│  │  └─ page.tsx                 // fetch content (CMS+fallback) → <EnterpriseLanding>
│  ├─ layout.tsx (root, existing)
│  └─ providers.tsx (existing)
├─ components/
│  ├─ marketing/
│  │  ├─ EnterpriseLanding.tsx    // composition root
│  │  ├─ layout/
│  │  │  ├─ StickyNav.tsx  MegaMenu.tsx  MobileNavSheet.tsx
│  │  │  ├─ EnterpriseFooter.tsx  CommandPalette.tsx
│  │  │  └─ (existing: MarketingShell, SiteHeader→refactor, AnnouncementBar, ThemeToggle)
│  │  ├─ hero/
│  │  │  ├─ HeroOperatingSystem.tsx
│  │  │  ├─ HeroDashboardDesktop.tsx  FloatingDevices.tsx
│  │  │  └─ widgets/ LiveQueueWidget.tsx RevenueWidget.tsx CalendarWidget.tsx
│  │  │            NotificationToast.tsx MetricPill.tsx DashSidebar.tsx
│  │  ├─ sections/
│  │  │  ├─ TrustBar.tsx  RoleShowcase.tsx  WorkflowTimeline.tsx
│  │  │  ├─ FeatureStoryGrid.tsx  PrescriptionExperience.tsx
│  │  │  ├─ DoctorProductivity.tsx  ReceptionDashboard.tsx  AdminDashboard.tsx
│  │  │  ├─ PlatformIntelligence.tsx  SecurityCompliance.tsx
│  │  │  ├─ ResponsivePwa.tsx  Testimonials.tsx  FaqSearchable.tsx
│  │  │  ├─ FinalCta.tsx  index.ts
│  │  │  └─ persona/ PersonaDashboard.tsx  GrowthChart.tsx  BranchTable.tsx
│  │  ├─ ui/ (marketing primitives)
│  │  │  ├─ EyebrowChip.tsx  GradientHeadline.tsx  CTACluster.tsx
│  │  │  ├─ DashWindow.tsx  StatCounter.tsx  Badge.tsx (extend)  IntelligenceTile.tsx
│  │  │  ├─ WorkflowNode.tsx  FeatureStoryBlock.tsx  TestimonialCard.tsx
│  │  │  └─ Section.tsx  SectionHeading.tsx (existing, extend)
│  │  └─ motion/ (existing: SmoothScroll, Reveal, TextReveal, AnimatedCounter, CustomCursor)
│  ├─ ui/ (shadcn, existing) + CommandPalette primitives (cmdk if added)
│  └─ ...
├─ hooks/marketing/
│  ├─ useRoleTabs.ts  useLiveQueueMock.ts  useFaqSearch.ts  useSectionReveal.ts
├─ lib/marketing/
│  ├─ types.ts (extend: SaaS content model)  fallback-content.ts  cms-api.ts
│  ├─ schema.ts  locale.ts  motion.ts (variants + GSAP presets)  tokens.ts
└─ ...
```

---

## 14. Tailwind Architecture (v4)

- **Engine:** Tailwind v4 `@import "tailwindcss"` + `@theme inline` (existing). **No `tailwind.config.js`** (v4 CSS-first).
- **Token bridge:** all `--color-*`, `--radius-*`, `--font-*` live in `globals.css` and are exposed in `@theme inline` → usable as `bg-brand-teal`, `rounded-2xl`, `shadow-card`.
- **Custom utilities** (layer `@layer utilities` or plain classes): `.surface-glass`, `.surface-card`, `.marketing-section`, `.marketing-bg-mesh`, `.marketing-noise`, `.text-display-xl|lg`, `.text-body-lg`, `.animate-float`, `.gradient-text`.
- **RTL:** `dir="rtl"` at root; use logical properties (`ps-`/`pe-`/`ms-`/`me-`/`start-`/`end-`) exclusively. Avoid `left/right`. Flip devices with `rtl:-scale-x-100` where needed.
- **Dark mode:** existing `@custom-variant dark (&:is(.dark *))`; every token has a `.dark` override.
- **Container:** utility `.marketing-container { @apply mx-auto w-full max-w-[80rem] px-5 sm:px-8 lg:px-10; }`.
- **Performance:** prefer utilities over arbitrary values; purge is automatic in v4.

---

## 15. Responsive Layout Rules

| Breakpoint | Width | Layout behavior |
|---|---|---|
| `base` | <640px | Single column. Hero dashboard → simplified stack, 2 floating tiles max. Nav collapses to sheet. |
| `sm` | ≥640px | 2-col feature blocks; trust logos wrap 3/row. |
| `md` | ≥768px | 2-col persona dashboards; workflow wraps 2 rows. |
| `lg` | ≥1024px | Full 12-col. Nav mega menu active. Hero desktop dashboard + all floating tiles. |
| `xl` | ≥1280px | `max-w-[80rem]` container; 3-col feature/story; triptych full. |
| `2xl` | ≥1536px | Extra breathing room; larger hero type ceiling. |

Rules:
- **Mobile-first** utilities; add `sm:`/`md:`/`lg:` upward.
- **No horizontal scroll.** Floating tiles use `overflow-hidden` on section + clamp.
- **Tap targets ≥ 44×44px.**
- **PWA:** installable (`manifest.webmanifest` existing), offline shell (serwist existing) — §13 surfaces this as a feature.
- **Safe areas:** `viewport-fit=cover` (existing) + `env(safe-area-inset-*)` on nav/footer.

---

## 16. Accessibility (WCAG 2.2 AA)

- **Contrast:** all text meets 4.5:1 (normal) / 3:1 (large/UI). Brand teal on white verified; gradient text only for large display ≥3:1. Document token contrast in a contrast matrix.
- **Keyboard:** full tab order; visible focus ring (`focus-visible:ring-2 ring-brand-teal`); skip-link (existing) to `#home`. Mega menu, tabs, accordion, command palette, dialogs all keyboard-operable (arrow keys, Esc, Home/End).
- **Semantics:** landmark roles — `<header nav>`, `<main>`, `<section aria-labelledby>`, `<footer>`. Each section H2 is a heading; `aria-label` on icon-only buttons.
- **RTL:** logical properties only; numbers/dates localized; mirror directional icons.
- **Motion:** `prefers-reduced-motion` fully honored (§8.5).
- **Forms:** labels associated, `aria-invalid`, `aria-describedby`, error announced.
- **Media:** testimonial videos have captions + transcript link; decorative imagery `aria-hidden`; informational imagery has alt.
- **Target size (2.2):** interactive elements ≥24×24 (aim 44×44).
- **Color independence:** never color-only signaling (icons + text labels).
- **Screen reader:** hidden animated counters expose final value via `aria-label`; live mock toasts `aria-live="polite"`.

---

## 17. SEO Strategy

- **Metadata:** rich `title`/`description` (Persian primary), canonical, `alternates` (fa/en future), `keywords` optional. Update root `layout.tsx` metadata to SaaS positioning.
- **Open Graph / Twitter:** 1200×630 OG image (brand gradient + product window), Twitter `summary_large_image`.
- **Structured data (JSON-LD):**
  - `SoftwareApplication` (Clinick) with `applicationCategory: HealthApplication`, `offers` (Free Trial), aggregateRating.
  - `Organization`, `WebSite` (+ `SearchAction` → FAQ/docs).
  - `FAQPage` from §15 items.
  - `BreadcrumbList` for any sub-routes.
  - `VideoObject` for testimonial videos.
- **Headings:** exactly one H1 (hero); H2 per section; no skipped levels.
- **Performance SEO:** SSG/ISR for `/` (`revalidate: 60`), critical CSS inlined by Next, `next/image` with `sizes`/`priority` on hero, lazy below-fold.
- **Internal linking:** footer + nav deep-link to `#platform`, `#doctors`, `#security`, docs, `/demo`, `/signup`.
- **i18n:** `hreflang` when English ships; `lang="fa" dir="rtl"` already set.

---

## 18. Content Strategy

### 18.1 Voice & tone
Enterprise-confident, calm, evidence-led. **Persian primary** (Vazirmatn). Every headline states an **outcome** (time saved, revenue, trust), not a feature.

### 18.2 Content model (extend `lib/marketing/types.ts`)
Add a `SaaSLandingContent` shape (CMS-driven, fallback-resolved):
```
nav · hero{eyebrow, h1, highlight, promise, ctas, trustChips}
trust{logos[], stats[{label,value,suffix}], securityBadges[]}
roles{patient|doctor|reception|admin {promise, benefits[], metric{}, cta}}
workflow{steps[{icon,label,detail}]}
features[]{eyebrow,title,promise,benefits[],metric,media,cta}
prescription{steps[]}
intelligence[]{icon,title,detail}
security{capabilities[], badges[]}
responsive{devices[]}
testimonials[]{clinic,verified,quote,stars,person{role,avatar},video?}
faq{groups[{title, items[{q,a}]}]}
finalCta{eyebrow,h2,promise,ctas[]}
footer{columns[], socials[], legal[], uptime}
```
### 18.3 Localization rules
- Persian numerals/dates; right-aligned reading; localized currency (Toman) in finance copy.
- CMS source: `NEXT_PUBLIC_CMS_URL` → merge → fallback (existing pattern). Nothing hard-coded in components.

---

## 19. Conversion Strategy (CRO)

- **CTA hierarchy:** one primary per fold; sticky nav always exposes "Request Demo" (enterprise) + "Start Free Trial" (self-serve).
- **Friction ladder:** read → (tab/play) → (FAQ) → **demo/trial**. Each section's CTA escalates commitment.
- **Social proof cadence:** §3 (logos) → §11 (intelligence) → §14 (testimonials) → §12 (security) — trust compounds toward §16.
- **Anchoring:** pricing-adjacent metrics ("from free", "99.98% uptime") reduce perceived risk.
- **Micro-conversions:** ⌘K, tab interaction, video play, FAQ expand → tracked events → retarget.
- **Risk reversal:** "Free Trial", "No credit card" (if true), SLA/uptime, SOC/data-residency cues in §12.
- **Directional cues:** gradient headlines + caret CTAs point toward action; visual weight always lands on the primary button.
- **Sticky CTA on mobile:** a compact `fixed bottom` bar appears after hero scroll: `[▸ Free Trial]`.

### 19.1 KPIs
Hero CTR (demo/trial) · scroll depth · tab interaction rate · FAQ open rate · demo form start% · Lighthouse ≥ 95 all categories.

---

## 20. Implementation Roadmap

Sequenced so each milestone ships a coherent, reviewable slice.

| Phase | Scope | Exit criteria |
|---|---|---|
| **0 — Tokens & primitives** | Extend tokens (§4), add `.surface-*`, `.marketing-container`, `.text-title-lg`, motion presets in `lib/marketing/motion.ts`. Build UI atoms (EyebrowChip, GradientHeadline, CTACluster, DashWindow, StatCounter, IntelligenceTile). | Storybook/isolated renders; contrast pass; dark mode pass. |
| **1 — Shell & nav** | `EnterpriseLanding`, refactor `SiteHeader→StickyNav`, `MegaMenu`, `MobileNavSheet`, `CommandPalette`, `EnterpriseFooter`. | Keyboard + a11y + RTL pass; ⌘K works; sticky behavior. |
| **2 — Hero + Trust** | `HeroOperatingSystem` + dashboard widgets + floating devices; `TrustBar` with counters. | 5-second test; reduced-motion pass; LCP < 2.5s. |
| **3 — Product story** | `RoleShowcase`, `WorkflowTimeline`, `FeatureStoryGrid`. | Tab engine; connector animation; alternation logic. |
| **4 — Persona deep dives** | `PrescriptionExperience`, `DoctorProductivity`, `ReceptionDashboard` (+ live queue mock), `AdminDashboard` (+ charts/table). | Mocks feel "alive"; charts animate; data deterministic. |
| **5 — Reassure** | `PlatformIntelligence`, `SecurityCompliance`, `ResponsivePwa`, `Testimonials`. | Hover reveals; compliance copy; video transcript. |
| **6 — Convert** | `FaqSearchable` (search+empty), `FinalCta`, footer polish. | FAQ search; CTA tracking wired; form states. |
| **7 — Quality gate** | SEO/JSON-LD, OG image, sitemap, Lighthouse 95+, a11y audit, i18n stub, perf budget. | All green; spec-vs-impl review. |

### 20.1 Definition of done (per section)
Visual matches wireframe · tokens-only (no hex) · keyboard operable · reduced-motion safe · RTL-correct · dark-mode correct · copy from content model (no hard-coding) · Lighthouse section passes · documented in this spec.

---

## 21. Open Decisions (flag for product owner)
1. **Motion engine:** confirm GSAP+Lenis (recommended, installed) **or** add Framer Motion (new dependency).
2. **Demo/Trial destinations:** confirm `/demo`, `/signup`, `/contact` routes (or external Calendly/HubSpot).
3. **Command palette dependency:** add `cmdk` or build atop existing primitives?
4. **Video hosting** for §14 testimonials (self-host vs. YouTube/Vimeo + `VideoObject`).
5. **Pricing:** none referenced in brief; confirm whether a Pricing section is added (recommended before §16 for SaaS credibility) or intentionally deferred to `/pricing`.
6. **i18n scope:** Persian-only at launch, or English variant in parallel?

---

## 22. Appendix — Spec-to-implementation traceability
- Design tokens → `FrontEnd/src/app/globals.css` (`@theme inline` + `:root`/`.dark`).
- Content model → `FrontEnd/src/lib/marketing/types.ts` + `fallback-content.ts` + `cms-api.ts`.
- Motion core → `FrontEnd/src/components/marketing/motion/*` (GSAP+Lenis, existing).
- Composition → `FrontEnd/src/components/marketing/EnterpriseLanding.tsx` (new root).
- Route → `FrontEnd/src/app/(marketing)/page.tsx`.

> This document is the contract. Implementation should reference section numbers in PRs (e.g., *"implements §4.1 brand ramp"*).
