# Panel Drawer (three-column staff shell)

**Date:** 2026-11-13  
**Status:** Approved for planning  
**Scope:** Doctor, reception, and admin panels (`AppShell`)

## Problem

Staff panels currently open create/edit and similar flows in centered `Dialog` modals. That fights the floating `AppShell` layout (sidebar + content cards) and blocks seeing list/context while editing.

## Goal

Replace staff **form** dialogs with a push **panel drawer** so the desktop shell becomes three columns when open:

**sidebar | panel content | drawer**

On mobile, the drawer is full-width over the content card (sidebar stays in its existing collapsed/sheet behavior).

## Decisions

| Topic | Choice |
| --- | --- |
| Scope | All form dialogs under `admin` / `doctor` / `reception` |
| Desktop layout | True push three-column flex (not overlay) |
| Mobile layout | Full-width drawer replacing the content card surface |
| Confirm/delete prompts | Stay as lightweight `Dialog` (short destructive confirms) |
| Patient panel / CMS | Out of scope |
| Official vaul bottom `Drawer` | Not required; custom push column matches the layout goal |

## Architecture

1. **`PanelDrawerProvider`** wraps staff shell content (inside `AppShell` / layouts that already use `AppShell`).
2. **API** for pages and form wrappers:
   - `openDrawer({ title, description?, content })`
   - `closeDrawer()`
   - `open` / optional state for “is drawer open”
3. **`PanelDrawer`** renders the third column (header + scrollable body). Forms no longer mount `Dialog` / `DialogContent`; they expose form body (and keep footer actions inside the form).
4. Pages that today do `<SomeFormDialog open onOpenChange />` instead call `openDrawer` with that form as `content`, or thin wrappers accept `open`/`onOpenChange` and render into the drawer slot via the context.

### Layout behavior

**Desktop (`md+`):**

- `SidebarInset` content row becomes a horizontal flex: existing content card + optional drawer card.
- When closed: content card is full width of the inset (unchanged).
- When open: content card flex-shrinks; drawer takes ~`min(24rem, 40%)` width.
- No dimmed backdrop; outside click does not dismiss (push panel, not modal overlay).

**Mobile (`< md`):**

- Drawer occupies the full content-card area (full width).
- Sidebar behavior unchanged (icon rail / sheet as today).

### Chrome & a11y

- Drawer surface matches shell cards: `rounded-2xl`, `bg-card`, soft shadow / ring.
- Fixed header: title, optional description, close control.
- Body scrolls independently; form submit/cancel stay in the form (footer inside body or sticky footer inside the drawer column).
- Close via ×, Escape, and form cancel → `closeDrawer()`.
- Focus moves into the drawer on open; returns to the trigger on close.
- Accessible name via title (`aria-labelledby` / equivalent).

### Motion

- Soft enter from the inline end (in RTL: visual start/left as appropriate for “end” column).
- Prefer width/opacity transition; no heavy overlay fade.

## Files

### New

- `FrontEnd/src/components/shared/panel/panel-drawer-context.tsx` — provider + `usePanelDrawer`
- `FrontEnd/src/components/shared/panel/PanelDrawer.tsx` — third-column UI

### Changed

- `FrontEnd/src/components/shared/panel/AppShell.tsx` — host provider + content/drawer flex row
- Staff form dialog modules (non-exhaustive; all dialog-based forms under staff apps), including:
  - Admin: `DoctorFormDialog`, `PatientFormDialog`, `ReceptionistFormDialog`, `ShiftsDialog`, leave form dialog, inline create/edit where applicable
  - Doctor: `ShiftFormDialog`, `TimeBlockDialog`, `LeaveFormDialog`, …
  - Reception: `RescheduleDialog`, `OfferSlotDialog`, `QuickRegisterForm`, calendar/queue dialogs that are forms (not tiny confirms)

### Unchanged by design

- Delete/confirm `Dialog`s (e.g. «حذف پزشک؟»)
- Patient-facing and CMS editor dialogs
- Form field layouts and validation logic (only the chrome: Dialog → panel drawer)

## Migration pattern

For each form dialog component:

1. Keep props like `open` / `onOpenChange` / entity id if useful for callers **or** migrate callers to `openDrawer` only — prefer one pattern project-wide: **callers use `openDrawer({ title, content: <Form … onDone={close} /> })`** and form components are presentational (no Dialog root).
2. Remove `Dialog*` imports and wrappers from the form module.
3. Wire success/cancel to `closeDrawer()` (or `onOpenChange(false)` if a thin adapter remains).

## Non-goals

- Redesigning form fields or validation
- Changing patient shell
- Requiring the shadcn/vaul bottom-sheet `Drawer` package for the desktop three-column layout
- Making confirm-delete flows into the third column

## Success criteria

- Opening any staff form flow on desktop shows three columns: sidebar, list/page content, drawer form.
- Opening the same flow on mobile shows a full-width form panel over content.
- Confirm-delete flows remain centered dialogs.
- No regression to AppShell floating card look (drawer uses the same surface language).
- Escape and close control dismiss the drawer; focus management is correct.
`)