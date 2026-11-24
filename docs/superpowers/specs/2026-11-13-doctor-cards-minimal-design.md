# Shared modern-minimal DoctorCard

**Date:** 2026-11-13  
**Status:** Approved for planning  
**Scope:** Public discovery doctor list + marketing landing doctors section

## Problem

Doctor cards exist in two places with divergent, visually heavy UIs:

1. `FrontEnd/src/components/discovery/DoctorCard.tsx` — horizontal avatar card with meta grid and pill chips  
2. Inline `DoctorCard` in `FrontEnd/src/components/marketing/sections/DoctorsSection.tsx` — photo card with overlays, glass chips, favorite heart, and dense meta

They do not share a visual language, and both feel busier than a modern minimal clinic product should.

## Goal

One shared vertical, modern-minimal doctor card used by both discovery and marketing, with balanced information density: identity + rating/fee + availability + clear actions — without decorative chrome.

## Decisions

| Topic | Choice |
| --- | --- |
| Scope | Both discovery and marketing cards |
| Density | Balanced (B): identity, rating/fee, one availability signal, CTAs |
| Layout | Shared vertical: photo on top, text below, no image overlays |
| Implementation | Single shared presentational component + adapters |
| Favorite / glass / overlay chips | Removed from card surface |
| Clinic line, weekdays list, council # as separate block | Not on card; stay on profile where applicable |
| Whole-card click | No — separate Book + Profile actions |

## Visual structure

Top → bottom:

1. **Photo** — full-bleed within card, fixed aspect `4/5`; no text, chips, heart, or dark gradient overlay on the image. Missing photo → simple brand-tinted monogram (initials), not a colorful multi-stop gradient.
2. **Body** — generous spacing:
   - Name (title) + optional verified badge
   - Specialty (one muted line)
   - Meta row: rating (+ review count when available) | visit fee
   - Single availability label when present (e.g. available today / next slot / online)
   - Actions: primary **Book** + secondary **Profile**
3. **Surface** — `bg-card`, thin border, very soft shadow; hover = slight lift + soft shadow only. No image scale zoom, no glass effects.

## Content keep / remove

**Keep on card:** photo/monogram, name, verified, specialty, rating (+ count), fee, one availability string, Book + Profile.

**Remove from card surface:** favorite heart, specialty chip on photo, photo overlays/gradients, days-available list, separate medical-council meta block, clinic as its own row, decorative icon clutter.

Context differences are data and hrefs only — not alternate chrome.

## Component architecture

### New shared module

- `FrontEnd/src/components/doctors/DoctorCard.tsx` — `DoctorCard` + `DoctorCardSkeleton`

### Normalized UI props (not raw API/CMS types)

```ts
{
  id: string
  name: string
  specialty: string
  imageUrl?: string
  rating?: number
  reviewsCount?: number
  fee?: number // Toman
  availabilityLabel?: string // short single string, or omitted
  verified?: boolean
  profileHref: string
  bookHref: string
  className?: string
}
```

### Adapters

- **Discovery:** map `types/doctor.Doctor` plus optional `firstAvailable` / `onlineConsult` into `availabilityLabel` and hrefs (`/doctors/:id`, profile query as today).
- **Marketing:** map `lib/marketing/types.Doctor` with `pickLocalized`; drop the inline `DoctorCard` from `DoctorsSection`.

### Compatibility

- Update imports in `DiscoveryView` and `DoctorsSection`.
- Prefer re-export from the old discovery path only if needed for a soft transition; otherwise update call sites directly.

## Interaction, a11y, i18n

- Two explicit actions; card itself is not a single link.
- Focus-visible rings on actions using existing brand tokens.
- Skeleton mirrors the vertical structure (photo block + text lines + action bar).
- Preserve RTL and existing digit helpers (`toPersianDigits` / marketing equivalents).
- Parent grids unchanged; only the card chrome and internal layout change.

## Files

### New

- `FrontEnd/src/components/doctors/DoctorCard.tsx`

### Changed

- `FrontEnd/src/components/discovery/DoctorCard.tsx` — replace with re-export or delete after call-site update
- `FrontEnd/src/components/discovery/DiscoveryView.tsx` — import shared card / adapter
- `FrontEnd/src/components/marketing/sections/DoctorsSection.tsx` — remove local `DoctorCard`; use shared card + mapper
- Skeleton usage sites as needed for matching structure

### Out of scope

- Doctor profile page redesign
- Admin/doctor roster tables
- Booking flow UX beyond the Book href already used
- New favorite/wishlist feature

## Success criteria

- Landing and discovery doctor cards look like the same component family.
- First glance reads as photo → name → specialty → fee/rating → one status → CTAs.
- No overlays, glass chips, or favorite control on the card.
- Loading skeleton matches the new vertical layout.
- Existing booking and profile destinations keep working.
