# Panel Content Container Design

**Date:** 2026-11-13  
**Status:** Approved

## Goal

Keep doctor, receptionist (secretary), and admin (manager) panel page content centered with a max width — not full-bleed across the content area. Match the patient panel pattern (`mx-auto w-full max-w-5xl`).

## Scope

**In scope**

- `FrontEnd/src/app/doctor/layout.tsx`
- `FrontEnd/src/app/reception/layout.tsx`
- `FrontEnd/src/app/admin/layout.tsx`

**Out of scope**

- Patient layout (already uses this pattern)
- Per-page wrappers or new shared components
- Sidebar / topbar width changes
- Visual redesign of page content

## Approach

Edit the `<main>` element in each of the three layouts. Add `mx-auto w-full max-w-5xl` while keeping existing padding classes.

| Layout     | Current `main` classes                         | Target `main` classes                                      |
|------------|------------------------------------------------|------------------------------------------------------------|
| Doctor     | `flex-1 px-4 py-6 sm:px-6 lg:px-8`             | `mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8` |
| Reception  | `flex-1 px-4 py-6 md:px-6`                     | `mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6`         |
| Admin      | `flex-1 px-4 py-6 md:px-6`                     | `mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6`         |

## Behavior

- On viewports narrower than `max-w-5xl` (~1024px), content still fills available width (via `w-full`) with existing horizontal padding.
- On wider viewports, content is centered; empty space appears on both sides of the main content area (inside `SidebarInset`, beside the sidebar).
- Sidebar and header/topbar remain full width of the inset area.

## Acceptance criteria

1. All routes under `/doctor/*`, `/reception/*`, and `/admin/*` show page body content constrained to `max-w-5xl` and horizontally centered.
2. No layout regressions on mobile (content still usable with padding).
3. No new components or files beyond the three layout edits.
