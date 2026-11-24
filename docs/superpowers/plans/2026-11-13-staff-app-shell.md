# Staff App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give doctor, reception, and admin panels a shared floating app shell: brand-gradient canvas with three separate rounded surfaces (sidebar, topbar, content); leave patient panel unchanged.

**Architecture:** Add `AppShell` that owns `SidebarProvider`, gradient canvas, floating sidebar (`variant="floating"`), floating `PanelTopbar` card, and floating content card with `max-w-7xl` main. Staff layouts only supply auth + nav props + children.

**Tech Stack:** Next.js App Router client layouts, shadcn sidebar primitives, Tailwind, existing Clinick CSS tokens (`--gradient-brand`, `--gradient-hero-glow`, `--shadow-card`).

## Global Constraints

- Composition: three separate floating pieces (sidebar, topbar, content) — not a single inset card.
- Canvas: Clinick brand gradient using existing tokens (not flat muted-only).
- Mobile: same floating inset look with tighter padding (`p-2` / `gap-2`); not full-bleed chrome.
- Patient layout must not change.
- Content width: `mx-auto w-full max-w-7xl` in the shell main; no new page-level `mx-auto max-w-*`.
- Spec: `docs/superpowers/specs/2026-11-13-staff-app-shell-design.md`
- Surfaces: `bg-card`, `rounded-2xl`, soft `--shadow-card` / `--shadow-soft` (no heavy glow).

---

## File map

| File | Responsibility |
|------|----------------|
| `FrontEnd/src/components/shared/panel/AppShell.tsx` | Shared staff shell (new) |
| `FrontEnd/src/components/shared/panel/PanelTopbar.tsx` | Topbar chrome; drop full-bleed sticky/border when floating |
| `FrontEnd/src/components/shared/Sidebar.tsx` | Pass `variant="floating"` to shadcn sidebar |
| `FrontEnd/src/app/doctor/layout.tsx` | Auth + nav → `AppShell` |
| `FrontEnd/src/app/reception/layout.tsx` | Auth + nav → `AppShell` |
| `FrontEnd/src/app/(patient)/layout.tsx` | Do not modify |

---

### Task 1: Create `AppShell` and adapt topbar/sidebar for floating surfaces

**Files:**
- Create: `FrontEnd/src/components/shared/panel/AppShell.tsx`
- Modify: `FrontEnd/src/components/shared/panel/PanelTopbar.tsx`
- Modify: `FrontEnd/src/components/shared/Sidebar.tsx`

**Interfaces:**
- Consumes: `NavItem[]`, existing `Sidebar`, `PanelTopbar`, `SidebarProvider` / `SidebarInset`
- Produces: `AppShell` props:

```ts
export interface AppShellProps {
  navItems: NavItem[];
  roleLabel: string;
  title?: string;
  accentIcon?: LucideIcon;
  children: React.ReactNode;
}
```

- [ ] **Step 1: Confirm baseline (no AppShell yet)**

Run:

```bash
test ! -f FrontEnd/src/components/shared/panel/AppShell.tsx && echo 'missing AppShell OK'
rg -n 'variant="floating"' FrontEnd/src/components/shared/Sidebar.tsx || echo 'no floating variant yet OK'
```

Expected: `missing AppShell OK` and `no floating variant yet OK`.

- [ ] **Step 2: Update `PanelTopbar` for use inside a floating card**

Replace the `<header>` `className` in `FrontEnd/src/components/shared/panel/PanelTopbar.tsx` so it is no longer sticky full-bleed glass with `border-b`. Use a transparent bar that fills its parent card:

```tsx
<header className="flex h-14 shrink-0 items-center gap-3 px-3 md:h-16 md:px-5">
```

Keep all inner content (trigger, separator, role label, search, bell, `UserMenu`) unchanged.

- [ ] **Step 3: Enable floating sidebar variant**

In `FrontEnd/src/components/shared/Sidebar.tsx`, change:

```tsx
<SidebarPrimitive side={side}>
```

to:

```tsx
<SidebarPrimitive side={side} variant="floating">
```

- [ ] **Step 4: Create `AppShell.tsx`**

Create `FrontEnd/src/components/shared/panel/AppShell.tsx` with:

```tsx
"use client";

import type { LucideIcon } from "lucide-react";

import { Sidebar } from "@/components/shared/Sidebar";
import { PanelTopbar } from "@/components/shared/panel/PanelTopbar";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import type { NavItem } from "@/types/nav";

export interface AppShellProps {
  navItems: NavItem[];
  roleLabel: string;
  title?: string;
  accentIcon?: LucideIcon;
  children: React.ReactNode;
}

/**
 * Floating staff app shell: brand-gradient canvas with three separate rounded
 * surfaces (sidebar, topbar, content). Used by doctor / reception / admin.
 */
export function AppShell({
  navItems,
  roleLabel,
  title = "Clinick",
  accentIcon,
  children,
}: AppShellProps) {
  return (
    <SidebarProvider
      className="min-h-svh [background:var(--gradient-brand)] relative"
    >
      {/* Soft brand glow overlay on the canvas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 [background:var(--gradient-hero-glow)]"
      />

      <Sidebar
        items={navItems}
        title={title}
        roleLabel={roleLabel}
        accentIcon={accentIcon}
      />

      <SidebarInset className="flex min-h-svh flex-1 flex-col bg-transparent p-2 md:p-3">
        <div className="flex min-h-0 flex-1 flex-col gap-2 md:gap-3">
          <div className="shrink-0 overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10">
            <PanelTopbar roleLabel={roleLabel} />
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10">
            <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </main>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}

export default AppShell;
```

Notes for the implementer:

- Prefer passing canvas background on `SidebarProvider` via its `className` prop (already forwarded to the wrapper `div`). If the provider wrapper fights the gradient, move the gradient to an outer `div` wrapping `SidebarProvider` with `className="min-h-svh [background:var(--gradient-brand)]"` and keep provider transparent.
- Do **not** use `SidebarInset`’s default opaque `bg-background` without overriding to `bg-transparent` — otherwise the canvas will not show between floating pieces.
- shadcn floating sidebar already adds `p-2` + rounded inner; that is the sidebar floating surface. Do not wrap `Sidebar` in a second rounded card.

- [ ] **Step 5: Lint new/changed shell files**

Run:

```bash
cd FrontEnd && npx eslint src/components/shared/panel/AppShell.tsx src/components/shared/panel/PanelTopbar.tsx src/components/shared/Sidebar.tsx
```

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add FrontEnd/src/components/shared/panel/AppShell.tsx \
  FrontEnd/src/components/shared/panel/PanelTopbar.tsx \
  FrontEnd/src/components/shared/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add floating AppShell primitives for staff panels

EOF
)"
```

---

### Task 2: Migrate doctor layout to `AppShell`

**Files:**
- Modify: `FrontEnd/src/app/doctor/layout.tsx`

**Interfaces:**
- Consumes: `AppShell` from Task 1
- Produces: doctor routes rendered inside the shared shell

- [ ] **Step 1: Replace doctor layout body**

Keep the existing `navItems` array and `RequireAuth`. Replace the `SidebarProvider` tree with:

```tsx
export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={["DOCTOR"]}>
      <AppShell
        navItems={navItems}
        title="Clinick"
        roleLabel="پنل پزشک"
        accentIcon={Stethoscope}
      >
        {children}
      </AppShell>
    </RequireAuth>
  );
}
```

Update imports:

- Remove direct imports of `Sidebar`, `PanelTopbar`, `SidebarInset`, `SidebarProvider`
- Add: `import { AppShell } from "@/components/shared/panel/AppShell";`
- Keep lucide icons used by `navItems` and `Stethoscope`

- [ ] **Step 2: Verify doctor layout wires AppShell**

Run:

```bash
rg -n 'AppShell|SidebarProvider|PanelTopbar' FrontEnd/src/app/doctor/layout.tsx
```

Expected: `AppShell` present; no `SidebarProvider` / `PanelTopbar` in this file.

- [ ] **Step 3: Lint**

```bash
cd FrontEnd && npx eslint src/app/doctor/layout.tsx
```

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/app/doctor/layout.tsx
git commit -m "$(cat <<'EOF'
feat(ui): migrate doctor panel to floating AppShell

EOF
)"
```

---

### Task 3: Migrate reception and admin layouts to `AppShell`

**Files:**
- Modify: `FrontEnd/src/app/reception/layout.tsx`
- Modify: `FrontEnd/src/app/admin/layout.tsx`
- Reference (do not modify): `FrontEnd/src/app/(patient)/layout.tsx`

**Interfaces:**
- Consumes: `AppShell`
- Produces: reception + admin share the same three-piece floating shell and `PanelTopbar`

- [ ] **Step 1: Rewrite reception layout**

Keep `navItems` and `RequireAuth allowedRoles={["RECEPTIONIST", "DOCTOR"]}`. Replace the sidebar/inset tree with:

```tsx
export default function ReceptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={["RECEPTIONIST", "DOCTOR"]}>
      <AppShell navItems={navItems} roleLabel="پنل منشی">
        {children}
      </AppShell>
    </RequireAuth>
  );
}
```

Remove unused imports (`Sidebar`, `SidebarInset`, `SidebarProvider`, `SidebarTrigger`, `Separator`).

Update the file comment: note that floating `PanelTopbar` (via `AppShell`) replaces the old mobile-only slim header.

- [ ] **Step 2: Rewrite admin layout**

Keep `navItems` and `RequireAuth allowedRoles={["ADMIN"]}`. Replace the sidebar/inset tree with:

```tsx
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={["ADMIN"]}>
      <AppShell navItems={navItems} roleLabel="پنل مدیریت">
        {children}
      </AppShell>
    </RequireAuth>
  );
}
```

Remove unused imports as in reception.

- [ ] **Step 3: Verify all staff layouts use AppShell; patient untouched**

Run:

```bash
rg -n 'AppShell' FrontEnd/src/app/doctor/layout.tsx FrontEnd/src/app/reception/layout.tsx FrontEnd/src/app/admin/layout.tsx
rg -n 'AppShell|SidebarProvider' FrontEnd/src/app/\(patient\)/layout.tsx || true
git diff -- FrontEnd/src/app/\(patient\)/layout.tsx
```

Expected:

- One `AppShell` match in each of the three staff layouts
- Patient file has neither `AppShell` nor new shell changes; `git diff` empty for patient layout

- [ ] **Step 4: Lint both layouts**

```bash
cd FrontEnd && npx eslint src/app/reception/layout.tsx src/app/admin/layout.tsx
```

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/app/reception/layout.tsx FrontEnd/src/app/admin/layout.tsx
git commit -m "$(cat <<'EOF'
feat(ui): migrate reception and admin panels to AppShell

EOF
)"
```

---

### Task 4: Visual acceptance smoke check

**Files:** none (verification only)

- [ ] **Step 1: Confirm floating surface class markers exist**

Run:

```bash
rg -n 'rounded-2xl bg-card|variant="floating"|gradient-brand|AppShell' \
  FrontEnd/src/components/shared/panel/AppShell.tsx \
  FrontEnd/src/components/shared/Sidebar.tsx \
  FrontEnd/src/app/doctor/layout.tsx \
  FrontEnd/src/app/reception/layout.tsx \
  FrontEnd/src/app/admin/layout.tsx
```

Expected: matches covering gradient canvas, floating sidebar variant, two `rounded-2xl bg-card` surfaces in `AppShell`, and three layout imports.

- [ ] **Step 2: Manual UI check (authenticated)**

With frontend running, on a wide viewport and a phone-width viewport, open:

- `/doctor/dashboard`
- `/reception/queue`
- `/admin/dashboard`

Confirm:

1. Brand gradient visible behind chrome
2. Three separate rounded floating pieces with visible gap
3. Mobile still inset/rounded (tighter), not edge-to-edge chrome
4. Patient routes unchanged

- [ ] **Step 3: No commit required unless fixes were needed**

If visual issues require code fixes, fix in the relevant task files, re-lint, and commit with a focused message, e.g.:

```bash
git commit -m "$(cat <<'EOF'
fix(ui): adjust AppShell spacing for floating staff panels

EOF
)"
```
