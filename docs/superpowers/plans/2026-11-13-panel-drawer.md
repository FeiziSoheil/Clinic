# Panel Drawer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace staff form Dialogs with a push panel drawer so desktop AppShell becomes three columns (sidebar | content | drawer); mobile drawer is full-width over content.

**Architecture:** `PanelDrawerProvider` + `usePanelDrawer()` live inside `AppShell`. `openDrawer({ title, description?, content })` mounts presentational form bodies in a third card column (push on `md+`, full-width on small screens). Confirm/delete Dialogs stay. Forms drop `Dialog*` wrappers and take `onDone` / `onCancel`.

**Tech Stack:** Next.js App Router (`"use client"`), React context, existing AppShell / Tailwind tokens, lucide-react icons. No new test runner (project has only `eslint`); verify with `rg`, `npx tsc --noEmit`, `npm run lint`, and manual UI checks.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-13-panel-drawer-design.md`
- Desktop: true push flex three-column — **no** dimmed backdrop; outside click does **not** dismiss
- Drawer width desktop: `w-full md:w-[min(24rem,40%)]` (shrink-0 on md+)
- Surfaces: same as shell cards — `rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10`
- Mobile (`< md`): drawer full-width; hide content card while open; sidebar unchanged
- Confirm/delete Dialogs remain Dialog
- Patient panel / CMS dialogs out of scope
- Do not add vaul bottom-sheet Drawer for this feature
- App is `dir="rtl"` (`FrontEnd/src/app/layout.tsx`); DOM order Sidebar → content → drawer yields visual sidebar | content | drawer in RTL
- Prefer mounting form content only while drawer is open (fresh mount = reset); drop `open` prop from forms when possible

---

## File map

| File | Responsibility |
|------|----------------|
| `FrontEnd/src/components/shared/panel/panel-drawer-context.tsx` | Provider, `openDrawer` / `closeDrawer` / state |
| `FrontEnd/src/components/shared/panel/PanelDrawer.tsx` | Third-column chrome (header, close, Escape, focus) |
| `FrontEnd/src/components/shared/panel/AppShell.tsx` | Host provider + content/drawer flex row |
| Staff `*FormDialog` / form Dialog modules under `admin` / `doctor` / `reception` | Presentational forms; no Dialog root |
| Staff pages that open those forms | Call `openDrawer` / `closeDrawer` |
| Delete/confirm Dialog blocks on those pages | Leave as Dialog |

---

### Task 1: Panel drawer context + `PanelDrawer` chrome

**Files:**
- Create: `FrontEnd/src/components/shared/panel/panel-drawer-context.tsx`
- Create: `FrontEnd/src/components/shared/panel/PanelDrawer.tsx`

**Interfaces:**
- Consumes: React, `Button`, `X` from lucide-react, `cn`
- Produces:

```ts
export type PanelDrawerPayload = {
  title: string;
  description?: string;
  content: React.ReactNode;
};

export type PanelDrawerContextValue = {
  open: boolean;
  title: string;
  description?: string;
  content: React.ReactNode | null;
  openDrawer: (payload: PanelDrawerPayload) => void;
  closeDrawer: () => void;
};

export function PanelDrawerProvider(props: { children: React.ReactNode }): JSX.Element;
export function usePanelDrawer(): PanelDrawerContextValue;
export function PanelDrawer(props: { className?: string }): JSX.Element | null;
```

- [ ] **Step 1: Confirm files are missing**

Run:

```bash
cd FrontEnd
test ! -f src/components/shared/panel/panel-drawer-context.tsx && echo 'missing context OK'
test ! -f src/components/shared/panel/PanelDrawer.tsx && echo 'missing PanelDrawer OK'
```

Expected: both `OK` lines.

- [ ] **Step 2: Create `panel-drawer-context.tsx`**

Create `FrontEnd/src/components/shared/panel/panel-drawer-context.tsx`:

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PanelDrawerPayload = {
  title: string;
  description?: string;
  content: ReactNode;
};

export type PanelDrawerContextValue = {
  open: boolean;
  title: string;
  description?: string;
  content: ReactNode | null;
  openDrawer: (payload: PanelDrawerPayload) => void;
  closeDrawer: () => void;
};

const PanelDrawerContext = createContext<PanelDrawerContextValue | null>(null);

export function PanelDrawerProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<string | undefined>();
  const [content, setContent] = useState<ReactNode | null>(null);

  const closeDrawer = useCallback(() => {
    setOpen(false);
    setContent(null);
    setTitle("");
    setDescription(undefined);
  }, []);

  const openDrawer = useCallback((payload: PanelDrawerPayload) => {
    setTitle(payload.title);
    setDescription(payload.description);
    setContent(payload.content);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({ open, title, description, content, openDrawer, closeDrawer }),
    [open, title, description, content, openDrawer, closeDrawer],
  );

  return (
    <PanelDrawerContext.Provider value={value}>
      {children}
    </PanelDrawerContext.Provider>
  );
}

export function usePanelDrawer(): PanelDrawerContextValue {
  const ctx = useContext(PanelDrawerContext);
  if (!ctx) {
    throw new Error("usePanelDrawer must be used within PanelDrawerProvider");
  }
  return ctx;
}
```

- [ ] **Step 3: Create `PanelDrawer.tsx`**

Create `FrontEnd/src/components/shared/panel/PanelDrawer.tsx`:

```tsx
"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { usePanelDrawer } from "@/components/shared/panel/panel-drawer-context";
import { cn } from "@/lib/utils";

export function PanelDrawer({ className }: { className?: string }) {
  const { open, title, description, content, closeDrawer } = usePanelDrawer();
  const panelRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const el = panelRef.current;
    el?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, closeDrawer]);

  if (!open) return null;

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10 outline-none",
        "w-full md:w-[min(24rem,40%)] md:shrink-0",
        "animate-in fade-in-0 slide-in-from-inline-end-4 duration-200",
        className,
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-foreground/10 px-4 py-3">
        <div className="min-w-0 flex flex-col gap-1">
          <h2 id={titleId} className="text-base font-semibold leading-none">
            {title}
          </h2>
          {description ? (
            <p
              id={descriptionId}
              className="text-sm text-muted-foreground"
            >
              {description}
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="بستن"
          onClick={closeDrawer}
        >
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{content}</div>
    </aside>
  );
}
```

- [ ] **Step 4: Typecheck new files**

Run:

```bash
cd FrontEnd && npx tsc --noEmit 2>&1 | head -40
```

Expected: no errors mentioning `panel-drawer-context` or `PanelDrawer` (unrelated pre-existing errors may appear; ignore those not from these files).

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/components/shared/panel/panel-drawer-context.tsx \
  FrontEnd/src/components/shared/panel/PanelDrawer.tsx
git commit -m "$(cat <<'EOF'
feat(ui): add panel drawer context and chrome

EOF
)"
```

---

### Task 2: Wire `AppShell` three-column host

**Files:**
- Modify: `FrontEnd/src/components/shared/panel/AppShell.tsx`

**Interfaces:**
- Consumes: `PanelDrawerProvider`, `usePanelDrawer`, `PanelDrawer`
- Produces: unchanged `AppShellProps`; internally hosts drawer layout

- [ ] **Step 1: Split shell body so context is available to children and drawer**

Replace `AppShell` implementation so Provider wraps the shell and an inner component reads `open`:

```tsx
"use client";

import type { LucideIcon } from "lucide-react";

import { Sidebar } from "@/components/shared/Sidebar";
import { PanelTopbar } from "@/components/shared/panel/PanelTopbar";
import { PanelDrawer } from "@/components/shared/panel/PanelDrawer";
import {
  PanelDrawerProvider,
  usePanelDrawer,
} from "@/components/shared/panel/panel-drawer-context";
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar";
import type { NavItem } from "@/types/nav";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  navItems: NavItem[];
  roleLabel: string;
  title?: string;
  accentIcon?: LucideIcon;
  children: React.ReactNode;
}

export function AppShell(props: AppShellProps) {
  return (
    <PanelDrawerProvider>
      <AppShellInner {...props} />
    </PanelDrawerProvider>
  );
}

function AppShellInner({
  navItems,
  roleLabel,
  title = "Clinick",
  accentIcon,
  children,
}: AppShellProps) {
  const { open } = usePanelDrawer();

  return (
    <div className="relative min-h-svh bg-[color-mix(in_oklch,var(--brand-mint)_5%,white)] dark:bg-[color-mix(in_oklch,var(--brand-emerald)_8%,var(--background))]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div
          className="absolute inset-x-0 top-0 h-[75%]"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at 50% -10%, color-mix(in oklch, var(--brand-emerald) 20%, transparent), color-mix(in oklch, var(--brand) 10%, transparent) 45%, transparent 70%)",
          }}
        />
        <div
          className="absolute -start-24 bottom-0 size-[28rem] rounded-full opacity-50 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--brand-emerald) 22%, transparent), transparent 70%)",
          }}
        />
        <div
          className="absolute -end-16 top-1/3 size-[22rem] rounded-full opacity-40 blur-3xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklch, var(--brand) 18%, transparent), transparent 70%)",
          }}
        />
      </div>

      <SidebarProvider className="relative min-h-svh bg-transparent">
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

            <div className="flex min-h-0 flex-1 gap-2 md:gap-3">
              <div
                className={cn(
                  "flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl bg-card shadow-[var(--shadow-card)] ring-1 ring-foreground/10",
                  open && "hidden md:flex",
                )}
              >
                <main className="mx-auto w-full max-w-7xl flex-1 overflow-y-auto px-4 py-6 sm:px-6 lg:px-8">
                  {children}
                </main>
              </div>
              <PanelDrawer />
            </div>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

export default AppShell;
```

Keep existing halo markup if it already differs slightly — only the Provider + flex row + `open && "hidden md:flex"` behavior are required.

- [ ] **Step 2: Verify provider wraps shell**

Run:

```bash
cd FrontEnd
rg -n "PanelDrawerProvider|PanelDrawer|usePanelDrawer" src/components/shared/panel/AppShell.tsx
```

Expected: matches for Provider, PanelDrawer, and usePanelDrawer.

- [ ] **Step 3: Lint AppShell**

Run:

```bash
cd FrontEnd && npx eslint src/components/shared/panel/AppShell.tsx src/components/shared/panel/PanelDrawer.tsx src/components/shared/panel/panel-drawer-context.tsx
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add FrontEnd/src/components/shared/panel/AppShell.tsx
git commit -m "$(cat <<'EOF'
feat(ui): host panel drawer column in AppShell

EOF
)"
```

---

### Task 3: Migrate doctor leave form (reference path)

**Files:**
- Modify: `FrontEnd/src/app/doctor/leaves/_components/LeaveFormDialog.tsx`
- Modify: `FrontEnd/src/app/doctor/leaves/page.tsx`

**Interfaces:**
- Consumes: `usePanelDrawer` from context
- Produces: presentational leave form:

```ts
export interface LeaveFormProps {
  doctorId: string;
  onDone: () => void;
  onCancel: () => void;
}
```

(Keep export name `LeaveFormDialog` as alias **or** rename to `LeaveForm` and update imports — prefer rename to `LeaveForm` and update the page import.)

- [ ] **Step 1: Strip Dialog chrome from leave form**

Rewrite `LeaveFormDialog.tsx` to a presentational form (no Dialog imports). Pattern:

```tsx
"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { JalaliDatePicker } from "@/components/ui/jalali-date-picker";
import { useCreateLeave } from "@/hooks/useLeaves";

export interface LeaveFormProps {
  doctorId: string;
  onDone: () => void;
  onCancel: () => void;
}

interface FormValues {
  date: string;
  reason: string;
}

const schema = z.object({
  date: z.string().min(1, "تاریخ الزامی است"),
  reason: z.string(),
});

export function LeaveForm({ doctorId, onDone, onCancel }: LeaveFormProps) {
  const createMutation = useCreateLeave();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { date: "", reason: "" },
  });

  useEffect(() => {
    form.reset({ date: "", reason: "" });
  }, [form]);

  const isPending = createMutation.isPending;

  async function onSubmit(values: FormValues) {
    await createMutation.mutateAsync({
      doctor_id: doctorId,
      start_date: values.date,
      end_date: values.date,
      reason: values.reason,
    });
    onDone();
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-4"
      >
        {/* same fields as before */}
        <div className="mt-2 flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isPending}
          >
            انصراف
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending && <Loader2 className="size-4 animate-spin" />}
            ثبت مرخصی
          </Button>
        </div>
      </form>
    </Form>
  );
}
```

Keep the existing field JSX; only remove Dialog wrappers and replace `DialogFooter` with the `div` footer above. Wire `onDone` / `onCancel` instead of `onOpenChange(false)`.

- [ ] **Step 2: Open via `openDrawer` from the leaves page**

In `FrontEnd/src/app/doctor/leaves/page.tsx`:

1. Import `usePanelDrawer` and `LeaveForm`.
2. Remove `LeaveFormDialog` mount and local `formOpen` state if only used for that dialog.
3. On «ثبت مرخصی» (or equivalent create button):

```tsx
const { openDrawer, closeDrawer } = usePanelDrawer();

function openCreateLeave() {
  openDrawer({
    title: "ثبت مرخصی",
    description: "یک مرخصی برای روز مشخص ثبت کنید.",
    content: (
      <LeaveForm
        doctorId={doctorId}
        onDone={closeDrawer}
        onCancel={closeDrawer}
      />
    ),
  });
}
```

4. Keep delete confirmation as Dialog (or existing inline confirm UI).

- [ ] **Step 3: Verify no Dialog in leave form module**

Run:

```bash
cd FrontEnd
rg -n "Dialog" src/app/doctor/leaves/_components/LeaveFormDialog.tsx || echo 'no Dialog OK'
rg -n "openDrawer|LeaveForm" src/app/doctor/leaves/page.tsx
```

Expected: `no Dialog OK`; page references `openDrawer` and `LeaveForm`.

- [ ] **Step 4: Manual check**

Run `npm run dev` if needed. Log in as doctor → Leaves → open create: desktop shows three columns; Escape closes; delete confirm still Dialog/confirm.

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/app/doctor/leaves/_components/LeaveFormDialog.tsx \
  FrontEnd/src/app/doctor/leaves/page.tsx
git commit -m "$(cat <<'EOF'
feat(ui): open doctor leave form in panel drawer

EOF
)"
```

---

### Task 4: Migrate admin doctor forms (Doctor / Patient / Receptionist / Shifts)

**Files:**
- Modify: `FrontEnd/src/app/admin/doctors/_components/DoctorFormDialog.tsx`
- Modify: `FrontEnd/src/app/admin/doctors/_components/PatientFormDialog.tsx`
- Modify: `FrontEnd/src/app/admin/doctors/_components/ReceptionistFormDialog.tsx`
- Modify: `FrontEnd/src/app/admin/doctors/_components/ShiftsDialog.tsx`
- Modify: `FrontEnd/src/app/admin/doctors/page.tsx`
- Modify: `FrontEnd/src/app/admin/doctors/[id]/patients/page.tsx`
- Modify: `FrontEnd/src/app/admin/doctors/[id]/receptionists/page.tsx`

**Interfaces:**
- Consumes: `usePanelDrawer`
- Produces: presentational props per form, e.g.:

```ts
// DoctorForm
{ doctor?: AdminDoctor | null; specialties: string[]; onDone: () => void; onCancel: () => void }

// PatientForm / ReceptionistForm — same pattern: drop open/onOpenChange; add onDone/onCancel
// ShiftsPanel — doctor + onCancel (and onDone if needed)
```

- [ ] **Step 1: Convert each of the four modules**

For each file:

1. Remove `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` imports/usage.
2. Move title/description strings to the **caller** `openDrawer({ title, description })` (header lives in `PanelDrawer`).
3. Replace `onOpenChange(false)` with `onDone()` after successful submit and `onCancel()` on انصراف.
4. Keep form fields and mutations unchanged.
5. Export renamed components (`DoctorForm`, `PatientForm`, `ReceptionistForm`, `ShiftsPanel`) **or** keep filenames and export new names from the same files; update all imports.

- [ ] **Step 2: Update admin doctors list page**

Replace:

```tsx
<DoctorFormDialog open={formOpen} onOpenChange={setFormOpen} doctor={editing} specialties={...} />
<ShiftsDialog open={shiftsOpen} onOpenChange={setShiftsOpen} doctor={shiftsDoctor} />
```

with open handlers:

```tsx
const { openDrawer, closeDrawer } = usePanelDrawer();

function openCreate() {
  openDrawer({
    title: "افزودن پزشک",
    description: /* same copy previously in DialogDescription */,
    content: (
      <DoctorForm
        specialties={COMMON_SPECIALTIES}
        onDone={closeDrawer}
        onCancel={closeDrawer}
      />
    ),
  });
}

function openEdit(doc: AdminDoctor) {
  openDrawer({
    title: "ویرایش پزشک",
    description: /* edit copy */,
    content: (
      <DoctorForm
        doctor={doc}
        specialties={COMMON_SPECIALTIES}
        onDone={closeDrawer}
        onCancel={closeDrawer}
      />
    ),
  });
}

function openShifts(doc: AdminDoctor) {
  openDrawer({
    title: /* shifts title */,
    description: /* optional */,
    content: (
      <ShiftsPanel doctor={doc} onCancel={closeDrawer} onDone={closeDrawer} />
    ),
  });
}
```

Remove unused `formOpen` / `editing` / `shiftsOpen` state **only if** fully replaced by drawer opens (you may keep `editing` local if still useful — prefer passing `doc` into `openEdit` directly).

**Keep** the delete confirm `<Dialog>...</Dialog>` block unchanged.

- [ ] **Step 3: Update patients + receptionists nested pages the same way**

Use `openDrawer` for create/edit forms; leave delete Dialogs.

- [ ] **Step 4: Sweep Dialog imports in migrated form modules**

Run:

```bash
cd FrontEnd
rg -n "from \"@/components/ui/dialog\"" \
  src/app/admin/doctors/_components/DoctorFormDialog.tsx \
  src/app/admin/doctors/_components/PatientFormDialog.tsx \
  src/app/admin/doctors/_components/ReceptionistFormDialog.tsx \
  src/app/admin/doctors/_components/ShiftsDialog.tsx \
  || echo 'forms clean OK'
rg -n "حذف پزشک|حذف منشی|حذف کامل" src/app/admin/doctors -g '*.tsx'
```

Expected: `forms clean OK`; delete copy still exists inside page-level Dialogs.

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/app/admin/doctors
git commit -m "$(cat <<'EOF'
feat(ui): migrate admin doctor forms to panel drawer

EOF
)"
```

---

### Task 5: Migrate doctor shifts + admin leaves

**Files:**
- Modify: `FrontEnd/src/app/doctor/shifts/_components/ShiftFormDialog.tsx`
- Modify: `FrontEnd/src/app/doctor/shifts/_components/TimeBlockDialog.tsx`
- Modify: `FrontEnd/src/app/doctor/shifts/page.tsx`
- Modify: `FrontEnd/src/app/admin/leaves/_components/LeaveFormDialog.tsx`
- Modify: `FrontEnd/src/app/admin/leaves/page.tsx`

**Interfaces:**
- Same presentational pattern: `onDone` / `onCancel`; titles via `openDrawer`

- [ ] **Step 1: Convert Shift + TimeBlock forms**

Remove Dialog chrome; keep fields; wire `onDone`/`onCancel`.

- [ ] **Step 2: Update `doctor/shifts/page.tsx`**

Replace mounted dialogs with `openDrawer({ title, description?, content: <ShiftForm … /> })` and TimeBlock equivalent. Keep any `window.confirm` delete as-is (not a form Dialog).

- [ ] **Step 3: Convert admin `LeaveFormDialog` + page**

Same pattern as doctor leave (Task 3), including doctor selector fields that already exist in admin form.

- [ ] **Step 4: Verify**

```bash
cd FrontEnd
rg -n "from \"@/components/ui/dialog\"" \
  src/app/doctor/shifts/_components \
  src/app/admin/leaves/_components \
  || echo 'clean OK'
rg -n "openDrawer" src/app/doctor/shifts/page.tsx src/app/admin/leaves/page.tsx
```

Expected: `clean OK`; both pages use `openDrawer`.

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/app/doctor/shifts FrontEnd/src/app/admin/leaves
git commit -m "$(cat <<'EOF'
feat(ui): migrate shift and leave forms to panel drawer

EOF
)"
```

---

### Task 6: Migrate reception form dialogs

**Files:**
- Modify: `FrontEnd/src/app/reception/queue/_components/RescheduleDialog.tsx`
- Modify: `FrontEnd/src/app/reception/queue/_components/QuickRegisterForm.tsx`
- Modify: `FrontEnd/src/app/reception/waiting-list/_components/OfferSlotDialog.tsx`
- Modify: `FrontEnd/src/app/reception/queue/page.tsx` (form Dialog usages only)
- Modify: `FrontEnd/src/app/reception/waiting-list/page.tsx` (if it mounts OfferSlot)
- Modify: `FrontEnd/src/app/reception/calendar/page.tsx` (form Dialog only — not tiny confirms)

**Interfaces:**
- Presentational forms + `openDrawer` from pages

- [ ] **Step 1: Identify form vs confirm Dialogs on reception pages**

Run:

```bash
cd FrontEnd
rg -n "DialogTitle|DialogContent" \
  src/app/reception/queue/page.tsx \
  src/app/reception/calendar/page.tsx \
  src/app/reception/waiting-list -g '*.tsx'
```

Migrate only form flows (reschedule, quick register, offer slot, calendar create/edit forms). Leave pure confirm Dialogs if any.

- [ ] **Step 2: Convert component modules**

Strip Dialog; add `onDone`/`onCancel`; move titles to callers.

- [ ] **Step 3: Wire pages with `openDrawer`**

- [ ] **Step 4: Verify staff form modules no longer import dialog (reception)**

```bash
cd FrontEnd
rg -n "from \"@/components/ui/dialog\"" \
  src/app/reception/queue/_components/RescheduleDialog.tsx \
  src/app/reception/queue/_components/QuickRegisterForm.tsx \
  src/app/reception/waiting-list/_components/OfferSlotDialog.tsx \
  || echo 'reception forms clean OK'
```

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/app/reception
git commit -m "$(cat <<'EOF'
feat(ui): migrate reception forms to panel drawer

EOF
)"
```

---

### Task 7: Final sweep + verification

**Files:**
- Any remaining staff form Dialog under `admin` / `doctor` / `reception` found by search

- [ ] **Step 1: List remaining Dialog imports under staff apps**

Run:

```bash
cd FrontEnd
rg -n "from \"@/components/ui/dialog\"" src/app/admin src/app/doctor src/app/reception
```

Expected: only page-level **confirm/delete** Dialogs (and any explicitly kept confirms). Every `*Form*` / create-edit module should be clean. If a form module still imports dialog, migrate it with the same pattern as Task 3 before finishing.

- [ ] **Step 2: Lint + typecheck**

```bash
cd FrontEnd && npm run lint 2>&1 | tail -30
cd FrontEnd && npx tsc --noEmit 2>&1 | tail -40
```

Expected: no new errors from panel drawer / migrated forms.

- [ ] **Step 3: Manual acceptance checklist**

1. Admin doctors: create/edit → three columns; delete → centered Dialog  
2. Doctor leaves + shifts: forms in drawer  
3. Reception reschedule / quick register / offer slot: drawer  
4. Resize below `md`: drawer full-width, content hidden while open  
5. Escape and × close drawer  

- [ ] **Step 4: Commit any leftover fixes**

```bash
git add -u FrontEnd/src
git status
# if there are changes:
git commit -m "$(cat <<'EOF'
fix(ui): finish staff panel drawer migration sweep

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|------------------|------|
| PanelDrawerProvider + openDrawer/closeDrawer | Task 1 |
| PanelDrawer chrome + Escape + a11y title | Task 1 |
| AppShell push three-column + mobile full-width | Task 2 |
| Form dialogs → presentational + openDrawer | Tasks 3–6 |
| Confirm/delete stay Dialog | Tasks 3–4, 7 |
| Patient/CMS out of scope | Not touched |
| No vaul Drawer required | Tasks 1–2 custom column |
| Success criteria (3-col, mobile, focus/escape) | Tasks 2, 7 |

## Placeholder / consistency check

- API names consistent: `openDrawer`, `closeDrawer`, `PanelDrawerPayload`, `usePanelDrawer`
- Forms use `onDone` / `onCancel` consistently after Task 3
- No TBD/TODO left in steps
`)