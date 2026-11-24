export {
  DURATION,
  DURATION_MS,
  EASE,
  EASE_CSS,
  SCROLL_START,
  STAGGER,
} from "./tokens";

export {
  CHEVRON,
  OVERLAY,
  PRESS,
  SHEET,
  SHEET_OVERLAY,
  SKELETON,
  SLIDE_FROM,
  SURFACE,
  SURFACE_OPEN,
  TRANSITION,
} from "./presets";

export {
  isAnimatedCounterEnabled,
  isLenisSmoothScrollEnabled,
  isMarketingMotionEnabled,
} from "./config";
export { prefersReducedMotion, useReducedMotion } from "./useReducedMotion";

/** GSAP ScrollTrigger reveal presets for marketing sections. */
export const REVEAL_VARIANTS = {
  fadeUp: { from: { opacity: 0, y: 24 }, to: { opacity: 1, y: 0 } },
  blurIn: {
    from: { opacity: 0, y: 16, filter: "blur(8px)" },
    to: { opacity: 1, y: 0, filter: "blur(0px)" },
  },
  scaleIn: { from: { opacity: 0, scale: 0.96 }, to: { opacity: 1, scale: 1 } },
  maskUp: { from: { opacity: 0, y: 28 }, to: { opacity: 1, y: 0 } },
  slideStart: { from: { opacity: 0, x: -24 }, to: { opacity: 1, x: 0 } },
  slideEnd: { from: { opacity: 0, x: 24 }, to: { opacity: 1, x: 0 } },
} as const;

export type RevealVariantKey = keyof typeof REVEAL_VARIANTS;
