/**
 * Tailwind class presets for consistent UI motion.
 * All presets include motion-reduce fallbacks where applicable.
 */

/** Safe property sets — never use bare `transition-all`. */
export const TRANSITION = {
  colors:
    "transition-[color,background-color,border-color,opacity] duration-200 ease-out motion-reduce:transition-none",
  transform:
    "transition-[transform,opacity] duration-200 ease-out motion-reduce:transition-none",
  interactive:
    "transition-[color,background-color,border-color,opacity,transform] duration-200 ease-out motion-reduce:transition-none",
  opacity:
    "transition-opacity duration-200 ease-out motion-reduce:transition-none",
} as const;

/** tw-animate-css enter/exit for overlays and floating surfaces. */
export const OVERLAY =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200 motion-reduce:animate-none motion-reduce:opacity-100";

export const SURFACE =
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200 ease-out motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:scale-100";

/** Base UI open/closed state (menus, tooltips). */
export const SURFACE_OPEN =
  "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-200 ease-out motion-reduce:animate-none motion-reduce:opacity-100 motion-reduce:scale-100";

export const SLIDE_FROM =
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2";

/** Sheet / drawer slide + fade. */
export const SHEET =
  "transition-[transform,opacity] duration-300 ease-out motion-reduce:transition-none motion-reduce:translate-none motion-reduce:opacity-100";

export const SHEET_OVERLAY =
  "transition-opacity duration-200 ease-out motion-reduce:transition-none";

/** Chevron / icon rotation. */
export const CHEVRON =
  "transition-transform duration-moderate ease-out motion-reduce:transition-none";

/** Skeleton shimmer — respects reduced motion via globals.css. */
export const SKELETON = "motion-safe:animate-pulse";

/** Active press feedback for buttons. */
export const PRESS =
  "active:not-aria-[haspopup]:translate-y-px motion-reduce:active:translate-y-0";
