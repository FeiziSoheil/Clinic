/**
 * Clinick motion tokens — single source of truth for timing and easing.
 * Prefer transform + opacity. GSAP values live alongside CSS/Tailwind tokens.
 */

/** Duration in milliseconds (CSS / Tailwind). */
export const DURATION_MS = {
  instant: 100,
  fast: 150,
  base: 200,
  moderate: 250,
  relaxed: 300,
  slow: 400,
  slower: 500,
} as const;

/** Duration in seconds (GSAP). */
export const DURATION = {
  instant: DURATION_MS.instant / 1000,
  fast: DURATION_MS.fast / 1000,
  base: DURATION_MS.base / 1000,
  moderate: DURATION_MS.moderate / 1000,
  relaxed: DURATION_MS.relaxed / 1000,
  slow: DURATION_MS.slow / 1000,
  slower: DURATION_MS.slower / 1000,
} as const;

/** CSS cubic-bezier curves (Stripe / Linear / Vercel feel). */
export const EASE_CSS = {
  out: "cubic-bezier(0.22, 1, 0.36, 1)",
  inOut: "cubic-bezier(0.16, 1, 0.3, 1)",
  outSoft: "cubic-bezier(0.33, 1, 0.68, 1)",
} as const;

/** GSAP easing strings. */
export const EASE = {
  outSoft: "power2.out",
  inOut: "power2.inOut",
  spring: "back.out(1.56)",
  outBack: "back.out(1.2)",
} as const;

export const SCROLL_START = "top 85%";
export const STAGGER = 0.08;
