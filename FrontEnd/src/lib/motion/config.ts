/**
 * Heavy marketing motion (GSAP scroll reveals, custom cursor) is opt-in because
 * it runs many ScrollTrigger instances. Set NEXT_PUBLIC_MARKETING_MOTION=true
 * to re-enable on capable devices.
 */
export function isMarketingMotionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MARKETING_MOTION === "true";
}

/** Lenis smooth scroll on public marketing pages — on by default. */
export function isLenisSmoothScrollEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LENIS_SMOOTH_SCROLL !== "false";
}

/** GSAP count-up for Stats counters — on by default. */
export function isAnimatedCounterEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ANIMATED_COUNTER !== "false";
}
