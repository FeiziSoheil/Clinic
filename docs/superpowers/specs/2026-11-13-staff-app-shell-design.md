# Staff App Shell Design

**Date:** 2026-11-13  
**Status:** Approved

## Goal

Give doctor, receptionist, and admin panels a shared floating **app shell**: a full-viewport brand-gradient canvas with three separate suspended surfaces (sidebar, topbar, content), each with rounded corners. Patient panel stays unchanged.

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| Composition | **B** — three separate floating pieces: sidebar, topbar, content |
| Canvas | **B** — Clinick brand gradient background |
| Mobile | **A** — same floating shell, tighter padding/gaps |
| Architecture | Shared `AppShell` component used by all three staff layouts |

## Scope

**In scope**

- New: `FrontEnd/src/components/shared/panel/AppShell.tsx`
- Modify: `FrontEnd/src/app/doctor/layout.tsx`
- Modify: `FrontEnd/src/app/reception/layout.tsx`
- Modify: `FrontEnd/src/app/admin/layout.tsx`
- Adjust as needed: `FrontEnd/src/components/shared/Sidebar.tsx`, `FrontEnd/src/components/shared/panel/PanelTopbar.tsx`
- Optionally lean on shadcn sidebar `variant="floating"` when it helps, without abandoning the three-piece composition

**Out of scope**

- Patient layout / routes
- Per-page content redesign
- New brand color tokens (reuse existing CSS variables)
- Changing nav items or auth guards

## Architecture

```
RequireAuth
  └── AppShell (SidebarProvider + canvas)
        ├── Sidebar (floating surface)
        └── main column (flex-1, gap)
              ├── PanelTopbar (floating surface)
              └── content card (floating surface)
                    └── <main max-w-7xl mx-auto>{children}</main>
```

`AppShell` props (conceptual):

- `navItems`, `title`, `roleLabel`, `accentIcon?`
- `children` — page content
- Internally always renders `PanelTopbar` with the same `roleLabel` so reception and admin match doctor.

## Visual

### Canvas

- Full viewport (`min-h-svh`)
- Brand gradient using existing tokens (e.g. `--gradient-hero` / `--gradient-hero-glow`), not a flat muted fill

### Floating surfaces (sidebar, topbar, content)

- `bg-card` (or equivalent solid panel surface)
- `rounded-2xl`
- Soft elevation via existing `--shadow-card` / `--shadow-soft` (no heavy glow)
- Desktop outer padding ~`p-3`, gap between pieces ~`gap-3`
- Mobile: same structure with tighter `p-2` / `gap-2`; surfaces remain rounded and inset from edges
- Sidebar scroll and content scroll stay independent inside their surfaces

### Topbar

- Reuse `PanelTopbar` chrome (trigger, role label, search, bell, user menu)
- Not full-bleed sticky across the viewport; lives inside its own floating card (no page-wide border-b)

### Content

- Keep page body constrained with `mx-auto w-full max-w-7xl` plus existing horizontal padding pattern
- Pages must not add a second page-level `mx-auto max-w-*` wrapper (already removed in prior work)

## Layout migration

| Layout | Before | After |
|--------|--------|-------|
| Doctor | Custom SidebarProvider + PanelTopbar + inset main | `AppShell` |
| Reception | SidebarProvider + mobile header strip + main | `AppShell` (replace slim header with floating `PanelTopbar`) |
| Admin | SidebarProvider + mobile header strip + main | `AppShell` (same as reception) |

## Behavior / a11y

- Desktop: sidebar visible as floating column (RTL: right side, existing default)
- Mobile: existing sheet/offcanvas sidebar behavior preserved; floating canvas + rounded topbar/content remain
- Focus rings and sidebar trigger continue to work
- Auth role guards unchanged per layout

## Acceptance criteria

1. Doctor, reception, and admin routes show a full brand-gradient canvas behind the chrome.
2. Sidebar, topbar, and content appear as three separate rounded floating surfaces with visible gap.
3. Mobile keeps the floating inset look (tighter padding), not full-bleed edge-to-edge chrome.
4. Patient panel is visually and structurally unchanged.
5. Content width remains consistent via layout `max-w-7xl` (no per-page max-width shells).
6. Reception and admin gain the same topbar pattern as doctor (via `PanelTopbar` inside `AppShell`).
