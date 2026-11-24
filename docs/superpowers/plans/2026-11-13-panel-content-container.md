# Panel Content Container Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center doctor, reception, and admin panel page content with `max-w-5xl`, matching the patient panel.

**Architecture:** One-line className updates on the `<main>` element in each role layout. No new components. Sidebar and topbar stay full width of `SidebarInset`; only the page body is constrained.

**Tech Stack:** Next.js App Router layouts, Tailwind CSS utility classes.

## Global Constraints

- Max width class must be exactly `max-w-5xl` (same as patient panel).
- Centering must use `mx-auto w-full`.
- Preserve each layout’s existing padding classes; do not normalize padding across roles.
- Do not change patient layout, pages, or create shared wrappers.
- Spec: `docs/superpowers/specs/2026-11-13-panel-content-container-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `FrontEnd/src/app/doctor/layout.tsx` | Doctor shell; constrain `<main>` |
| `FrontEnd/src/app/reception/layout.tsx` | Receptionist shell; constrain `<main>` |
| `FrontEnd/src/app/admin/layout.tsx` | Admin shell; constrain `<main>` |

---

### Task 1: Apply `max-w-5xl` container to doctor / reception / admin layouts

**Files:**
- Modify: `FrontEnd/src/app/doctor/layout.tsx:65`
- Modify: `FrontEnd/src/app/reception/layout.tsx:54`
- Modify: `FrontEnd/src/app/admin/layout.tsx:57`
- Reference (do not modify): `FrontEnd/src/app/(patient)/layout.tsx:42`

**Interfaces:**
- Consumes: existing layout `<main>` wrappers and Tailwind utilities already used by patient layout (`mx-auto w-full max-w-5xl`)
- Produces: all three staff panels constrain page children the same way

- [x] **Step 1: Record baseline (missing container classes)**

Run:

```bash
rg -n '<main className=' FrontEnd/src/app/doctor/layout.tsx FrontEnd/src/app/reception/layout.tsx FrontEnd/src/app/admin/layout.tsx
```

Expected: three lines **without** `max-w-5xl`:

```
FrontEnd/src/app/doctor/layout.tsx:65:          <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
FrontEnd/src/app/reception/layout.tsx:54:          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
FrontEnd/src/app/admin/layout.tsx:57:          <main className="flex-1 px-4 py-6 md:px-6">{children}</main>
```

- [x] **Step 2: Update doctor layout `<main>`**

In `FrontEnd/src/app/doctor/layout.tsx`, replace:

```tsx
<main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
```

with:

```tsx
<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
```

- [x] **Step 3: Update reception layout `<main>`**

In `FrontEnd/src/app/reception/layout.tsx`, replace:

```tsx
<main className="flex-1 px-4 py-6 md:px-6">{children}</main>
```

with:

```tsx
<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">{children}</main>
```

- [x] **Step 4: Update admin layout `<main>`**

In `FrontEnd/src/app/admin/layout.tsx`, replace:

```tsx
<main className="flex-1 px-4 py-6 md:px-6">{children}</main>
```

with:

```tsx
<main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">{children}</main>
```

- [x] **Step 5: Verify all three layouts have the container classes**

Run:

```bash
rg -n 'max-w-5xl' FrontEnd/src/app/doctor/layout.tsx FrontEnd/src/app/reception/layout.tsx FrontEnd/src/app/admin/layout.tsx
```

Expected: one match per file, each `<main className>` starts with `mx-auto w-full max-w-5xl`.

Also confirm patient layout still untouched:

```bash
git diff -- FrontEnd/src/app/\(patient\)/layout.tsx
```

Expected: empty output.

- [x] **Step 6: Manual UI smoke check**

With the frontend running, open a wide viewport (≥1280px) and confirm content is centered (not edge-to-edge) on at least one route per role:

- `/doctor/dashboard`
- `/reception/queue`
- `/admin/dashboard`

Sidebar/header should still span the inset full width; only the page body should be capped.

- [x] **Step 7: Commit**

```bash
git add FrontEnd/src/app/doctor/layout.tsx FrontEnd/src/app/reception/layout.tsx FrontEnd/src/app/admin/layout.tsx
git commit -m "$(cat <<'EOF'
fix(ui): center staff panel content in max-w-5xl container

EOF
)"
```
