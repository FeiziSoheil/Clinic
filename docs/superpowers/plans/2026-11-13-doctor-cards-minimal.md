# Shared Minimal DoctorCard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace discovery and marketing doctor cards with one shared vertical modern-minimal `DoctorCard` (photo → identity → rating/fee → availability → CTAs).

**Architecture:** Introduce a presentational card under `FrontEnd/src/components/doctors/` that takes a normalized view model. Discovery and marketing each map their domain `Doctor` types into that model. Old discovery module becomes a thin re-export/adapter; marketing deletes its inline card.

**Tech Stack:** Next.js App Router, React client components, Tailwind, `next/image`, existing `StarRating`, `formatToman`, `TRANSITION` / `PRESS` motion presets.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-13-doctor-cards-minimal-design.md`
- Shared vertical layout; photo aspect `4/5`; no overlays, glass chips, favorite, or image scale zoom
- Balanced density only: name, specialty, rating(+count), fee, one availability label, Book + Profile
- Card is not a whole-card link — two explicit actions
- FrontEnd has no unit-test runner; verify with `pnpm lint`, TypeScript via `pnpm build` (or `npx tsc --noEmit` if configured), and the visual checklist in Task 5
- Do not redesign doctor profile pages, admin tables, or booking flow

---

## File map

| File | Responsibility |
|------|----------------|
| `FrontEnd/src/components/doctors/types.ts` | Normalized `DoctorCardModel` |
| `FrontEnd/src/components/doctors/mappers.ts` | Pure adapters from discovery + marketing doctors |
| `FrontEnd/src/components/doctors/DoctorCard.tsx` | Shared card + skeleton UI |
| `FrontEnd/src/components/doctors/index.ts` | Public barrel exports |
| `FrontEnd/src/components/discovery/DoctorCard.tsx` | Thin discovery wrapper / re-export preserving old props |
| `FrontEnd/src/components/discovery/DiscoveryView.tsx` | Keep importing local `DoctorCard` / skeleton (via wrapper) |
| `FrontEnd/src/components/marketing/sections/DoctorsSection.tsx` | Remove inline card; map + render shared card inside `Reveal` |

---

### Task 1: Normalized model + mappers

**Files:**
- Create: `FrontEnd/src/components/doctors/types.ts`
- Create: `FrontEnd/src/components/doctors/mappers.ts`

**Interfaces:**
- Consumes: `@/types/doctor.Doctor`, `@/lib/marketing/types.Doctor`, `Locale`, `pickLocalized`
- Produces:

```ts
export interface DoctorCardModel {
  id: string;
  name: string;
  specialty: string;
  imageUrl?: string;
  rating?: number;
  reviewsCount?: number;
  fee?: number;
  availabilityLabel?: string;
  verified?: boolean;
  profileHref: string;
  bookHref: string;
}

export function mapDiscoveryDoctorToCard(
  doctor: import("@/types/doctor").Doctor,
  opts?: { firstAvailable?: string; onlineConsult?: boolean },
): DoctorCardModel;

export function mapMarketingDoctorToCard(
  doctor: import("@/lib/marketing/types").Doctor,
  locale: import("@/lib/marketing/types").Locale,
): DoctorCardModel;
```

- [ ] **Step 1: Add `types.ts`**

```ts
export interface DoctorCardModel {
  id: string;
  name: string;
  specialty: string;
  imageUrl?: string;
  rating?: number;
  reviewsCount?: number;
  fee?: number;
  /** Single short availability string; omit when none. */
  availabilityLabel?: string;
  verified?: boolean;
  profileHref: string;
  bookHref: string;
}
```

- [ ] **Step 2: Add `mappers.ts` with availability priority rules**

```ts
import { pickLocalized } from "@/lib/marketing/locale";
import type { Doctor as DiscoveryDoctor } from "@/types/doctor";
import type { Doctor as MarketingDoctor, Locale } from "@/lib/marketing/types";
import type { DoctorCardModel } from "./types";

function discoveryAvailability(opts?: {
  firstAvailable?: string;
  onlineConsult?: boolean;
}): string | undefined {
  if (opts?.firstAvailable) {
    return `نزدیک‌ترین نوبت: ${opts.firstAvailable}`;
  }
  if (opts?.onlineConsult) return "مشاوره آنلاین";
  return undefined;
}

function marketingAvailability(
  doctor: MarketingDoctor,
  locale: Locale,
): string | undefined {
  if (doctor.availableToday) {
    return locale === "en" ? "Available today" : "امروز آزاد است";
  }
  if (doctor.nextSlot) {
    const slot = pickLocalized(doctor.nextSlot, locale);
    return locale === "en" ? `Next: ${slot}` : `نزدیک‌ترین: ${slot}`;
  }
  if (doctor.onlineConsult) {
    return locale === "en" ? "Online visit" : "ویزیت آنلاین";
  }
  return undefined;
}

export function mapDiscoveryDoctorToCard(
  doctor: DiscoveryDoctor,
  opts?: { firstAvailable?: string; onlineConsult?: boolean },
): DoctorCardModel {
  return {
    id: doctor.id,
    name: doctor.full_name,
    specialty: doctor.specialty,
    imageUrl: doctor.avatar_url,
    rating: doctor.rating,
    fee: doctor.visit_fee,
    availabilityLabel: discoveryAvailability(opts),
    profileHref: `/doctors/${doctor.id}?view=profile`,
    bookHref: `/doctors/${doctor.id}`,
  };
}

export function mapMarketingDoctorToCard(
  doctor: MarketingDoctor,
  locale: Locale,
): DoctorCardModel {
  return {
    id: doctor.id,
    name: pickLocalized(doctor.name, locale),
    specialty: pickLocalized(doctor.specialty, locale),
    imageUrl: doctor.imageUrl || undefined,
    rating: doctor.rating,
    reviewsCount: doctor.reviewsCount,
    fee: doctor.fee,
    availabilityLabel: marketingAvailability(doctor, locale),
    verified: doctor.verified,
    profileHref: doctor.profileHref,
    bookHref: doctor.bookHref,
  };
}
```

- [ ] **Step 3: Manually verify mapper contracts**

In a Node REPL or temporary scratch (do not commit scratch), sanity-check:

1. Discovery with only `onlineConsult: true` → `availabilityLabel === "مشاوره آنلاین"`.
2. Discovery with both `firstAvailable` and `onlineConsult` → label uses `firstAvailable` only.
3. Marketing `availableToday: true` + `nextSlot` set → FA label `"امروز آزاد است"` (today wins).
4. Empty `imageUrl: ""` from marketing → `imageUrl` is `undefined`.

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/components/doctors/types.ts FrontEnd/src/components/doctors/mappers.ts
git commit -m "$(cat <<'EOF'
feat(doctors): add shared DoctorCard view model and mappers

EOF
)"
```

---

### Task 2: Shared `DoctorCard` + skeleton

**Files:**
- Create: `FrontEnd/src/components/doctors/DoctorCard.tsx`
- Create: `FrontEnd/src/components/doctors/index.ts`

**Interfaces:**
- Consumes: `DoctorCardModel` from `./types`; `StarRating`; `formatToman` / `toPersianDigits` / `cn`; `TRANSITION` / `PRESS`; `next/image`; `next/link`; `BadgeCheck` from lucide
- Produces: `DoctorCard`, `DoctorCardSkeleton`, re-exported from `./index`

- [ ] **Step 1: Implement shared card UI**

Create `FrontEnd/src/components/doctors/DoctorCard.tsx`:

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { BadgeCheck } from "lucide-react";

import { StarRating } from "@/components/marketing/ui/StarRating";
import { PRESS, TRANSITION } from "@/lib/motion";
import { cn, formatToman, toPersianDigits } from "@/lib/utils";
import type { DoctorCardModel } from "./types";

export interface DoctorCardProps extends DoctorCardModel {
  locale?: "fa" | "en";
  className?: string;
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/);
  return `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`;
}

export function DoctorCard({
  name,
  specialty,
  imageUrl,
  rating,
  reviewsCount,
  fee,
  availabilityLabel,
  verified,
  profileHref,
  bookHref,
  locale = "fa",
  className,
}: DoctorCardProps) {
  const bookLabel = locale === "en" ? "Book" : "نوبت‌دهی";
  const profileLabel = locale === "en" ? "Profile" : "پروفایل";
  const initials = initialsFromName(name);

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card",
        "shadow-soft motion-safe:hover:-translate-y-1 hover:shadow-float",
        TRANSITION.transform,
        className,
      )}
    >
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-muted">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 90vw"
            className="object-cover"
          />
        ) : (
          <div
            className="grid size-full place-items-center bg-brand-mint text-brand"
            aria-hidden="true"
          >
            <span className="text-4xl font-bold tracking-tight">
              {locale === "fa" ? toPersianDigits(initials || "؟") : initials || "?"}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-lg font-bold leading-tight tracking-tight">
              {name}
            </h3>
            {verified ? (
              <BadgeCheck
                className="size-4 shrink-0 text-brand"
                aria-label={locale === "en" ? "Verified" : "تأیید‌شده"}
              />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">{specialty}</p>
        </div>

        <div className="flex items-center justify-between gap-3 text-sm">
          <StarRating value={rating} count={reviewsCount} locale={locale} size={14} />
          {typeof fee === "number" ? (
            <span className="shrink-0 font-semibold tabular-nums">{formatToman(fee)}</span>
          ) : null}
        </div>

        {availabilityLabel ? (
          <p className="text-meta text-muted-foreground">{availabilityLabel}</p>
        ) : null}

        <div className="mt-auto flex items-center gap-2 pt-1">
          <Link
            href={bookHref}
            className={cn(
              "inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2",
              TRANSITION.interactive,
              PRESS,
            )}
          >
            {bookLabel}
          </Link>
          <Link
            href={profileHref}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-border bg-card px-4 text-sm font-medium transition-colors hover:border-brand/40 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          >
            {profileLabel}
          </Link>
        </div>
      </div>
    </article>
  );
}

export function DoctorCardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card",
        className,
      )}
      aria-hidden="true"
    >
      <div className="aspect-[4/5] w-full animate-pulse bg-muted" />
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="space-y-2">
          <div className="h-5 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        </div>
        <div className="flex justify-between gap-3">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-4 w-20 animate-pulse rounded bg-muted" />
        </div>
        <div className="h-4 w-40 animate-pulse rounded bg-muted" />
        <div className="mt-auto flex gap-2 pt-1">
          <div className="h-10 flex-1 animate-pulse rounded-xl bg-muted" />
          <div className="h-10 w-20 animate-pulse rounded-xl bg-muted" />
        </div>
      </div>
    </div>
  );
}
```

Notes for implementer:

- Decorative `alt=""` on the photo; name is in the heading.
- Do **not** add overlay, Heart, specialty chip, clinic row, days list, or council number block.
- If `next/image` rejects a remote host, follow existing `images.remotePatterns` in Next config (same hosts marketing already uses); discovery avatars that fail can temporarily use `<img>` only if build/runtime forces it — prefer fixing config over forking UI.

- [ ] **Step 2: Add barrel `index.ts`**

```ts
export type { DoctorCardModel } from "./types";
export { mapDiscoveryDoctorToCard, mapMarketingDoctorToCard } from "./mappers";
export { DoctorCard, DoctorCardSkeleton } from "./DoctorCard";
export type { DoctorCardProps } from "./DoctorCard";
```

- [ ] **Step 3: Lint the new files**

Run: `cd FrontEnd && pnpm lint -- src/components/doctors`

Expected: no errors in the new files.

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/components/doctors
git commit -m "$(cat <<'EOF'
feat(doctors): add shared minimal DoctorCard UI

EOF
)"
```

---

### Task 3: Wire discovery through adapter

**Files:**
- Modify: `FrontEnd/src/components/discovery/DoctorCard.tsx` (replace body with thin wrapper)
- Modify: `FrontEnd/src/components/discovery/DiscoveryView.tsx` only if imports need updating (prefer keeping `./DoctorCard`)

**Interfaces:**
- Consumes: `mapDiscoveryDoctorToCard`, shared `DoctorCard` / `DoctorCardSkeleton`
- Produces: same public API as today:

```ts
export interface DoctorCardProps {
  doctor: Doctor;
  firstAvailable?: string;
  onlineConsult?: boolean;
  className?: string;
}
export function DoctorCard(props: DoctorCardProps): JSX.Element;
export function DoctorCardSkeleton(): JSX.Element;
```

- [ ] **Step 1: Replace discovery `DoctorCard.tsx` with adapter**

```tsx
"use client";

import type { Doctor } from "@/types/doctor";
import {
  DoctorCard as SharedDoctorCard,
  DoctorCardSkeleton as SharedDoctorCardSkeleton,
  mapDiscoveryDoctorToCard,
} from "@/components/doctors";

export interface DoctorCardProps {
  doctor: Doctor;
  firstAvailable?: string;
  onlineConsult?: boolean;
  className?: string;
}

export function DoctorCard({
  doctor,
  firstAvailable,
  onlineConsult,
  className,
}: DoctorCardProps) {
  const model = mapDiscoveryDoctorToCard(doctor, {
    firstAvailable,
    onlineConsult,
  });
  return <SharedDoctorCard {...model} locale="fa" className={className} />;
}

export function DoctorCardSkeleton() {
  return <SharedDoctorCardSkeleton />;
}
```

- [ ] **Step 2: Confirm `DiscoveryView` still imports from `./DoctorCard`**

No change required if Step 1 preserves exports. Open `DiscoveryView.tsx` and confirm:

```ts
import { DoctorCard, DoctorCardSkeleton } from "./DoctorCard";
```

- [ ] **Step 3: Lint discovery files**

Run: `cd FrontEnd && pnpm lint -- src/components/discovery/DoctorCard.tsx src/components/discovery/DiscoveryView.tsx`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/components/discovery/DoctorCard.tsx
git commit -m "$(cat <<'EOF'
refactor(discovery): use shared minimal DoctorCard

EOF
)"
```

---

### Task 4: Wire marketing `DoctorsSection`

**Files:**
- Modify: `FrontEnd/src/components/marketing/sections/DoctorsSection.tsx`

**Interfaces:**
- Consumes: `mapMarketingDoctorToCard`, shared `DoctorCard`, existing `Reveal` / `Section` / `SectionHeading`
- Produces: same `DoctorsSection` props API as today

- [ ] **Step 1: Strip local card helpers and render shared card**

Replace the file contents with:

```tsx
"use client";

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
```

Delete from this file (do not leave unused): local `DoctorCard`, `gradientFor`, `initials`, `formatFee`, `useState`, `Image`, `Link`, `CTALink`, `StarRating`, Heart/Video/Timer/etc. imports.

- [ ] **Step 2: Update the file header comment** to describe the minimal shared card (no favorite / overlay claims).

- [ ] **Step 3: Lint**

Run: `cd FrontEnd && pnpm lint -- src/components/marketing/sections/DoctorsSection.tsx`

Expected: clean; no unused imports.

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/components/marketing/sections/DoctorsSection.tsx
git commit -m "$(cat <<'EOF'
refactor(marketing): use shared minimal DoctorCard in DoctorsSection

EOF
)"
```

---

### Task 5: Build + visual verification

**Files:**
- None (verification only); fix only if build/lint fails

**Interfaces:**
- Consumes: Tasks 1–4 deliverables
- Produces: confirmed success criteria from the spec

- [ ] **Step 1: Lint + build**

Run:

```bash
cd FrontEnd && pnpm lint && pnpm build
```

Expected: success. If `next/image` remote host errors appear for discovery avatars, add the host to Next image config or switch the shared photo branch to a plain `<img>` when `imageUrl` is not a configured remote — prefer one consistent approach for both call sites.

- [ ] **Step 2: Visual checklist (dev server)**

Run: `cd FrontEnd && pnpm dev`

Check:

1. Landing `#doctors` grid: vertical cards, photo without overlay/heart/chip, name + specialty below, rating/fee, at most one availability line, Book + Profile.
2. Discovery `/doctors` (or discovery route used by the app): same card family; skeleton matches vertical structure while loading.
3. Hover: slight lift only; photo does not scale.
4. Book and Profile navigate to the previous destinations.
5. RTL still looks correct; fees use `formatToman`.

- [ ] **Step 3: Commit any build fixes** (only if Step 1 required code changes)

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(doctors): resolve shared DoctorCard build issues

EOF
)"
```

If no fixes were needed, skip this commit.

---

## Spec coverage (self-review)

| Spec requirement | Task |
| --- | --- |
| Shared vertical photo/`4/5`/no overlay | Task 2 |
| Balanced content keep/remove list | Tasks 2, 4 |
| Single shared presentational component + adapters | Tasks 1–4 |
| Discovery mapper + hrefs | Tasks 1, 3 |
| Marketing mapper + remove inline card | Tasks 1, 4 |
| Skeleton matches layout | Tasks 2, 3 |
| Two actions, focus rings, soft hover | Task 2 |
| RTL / digit helpers | Task 2 (`formatToman`, `toPersianDigits`) |
| Parent grids unchanged | Tasks 3–4 |
| Out of scope left alone | No tasks touch profile/admin/booking internals |
| Success criteria | Task 5 |

No placeholders left; mapper and component signatures are consistent across tasks (`DoctorCardModel`, `mapDiscoveryDoctorToCard`, `mapMarketingDoctorToCard`, `DoctorCard` / `DoctorCardSkeleton`).
