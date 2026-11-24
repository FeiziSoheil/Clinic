"use client";

/**
 * ============================================================================
 * CLINICK — SCROLL REVEAL
 * ============================================================================
 * A thin, reusable wrapper that reveals its content into the viewport with a
 * premium GSAP/ScrollTrigger animation. Supports a curated set of variants so
 * each section can pick a distinct entrance (we never repeat the same motion
 * across the whole page).
 *
 * Accessibility:
 *  - Respects `prefers-reduced-motion` (renders content instantly, no transform).
 *  - Starts hidden via `motion-safe:opacity-0` so the first paint never flashes
 *    fully-visible content before GSAP takes over. Reduced-motion users (and
 *    environments without the motion-safe variant) see content immediately.
 * ============================================================================
 */

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { isMarketingMotionEnabled } from "@/lib/motion/config";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

export type RevealVariant =
  | "fade-up"
  | "fade-down"
  | "fade"
  | "blur"
  | "scale"
  | "slide-start"
  | "slide-end"
  | "mask-up";

export interface RevealProps {
  children: ReactNode;
  /** Element/tag to render. Defaults to `div`. */
  as?: ElementType;
  className?: string;
  variant?: RevealVariant;
  /** Seconds before the animation starts (after entering the viewport). */
  delay?: number;
  duration?: number;
  /** Stagger between direct children (seconds). Animates children when set. */
  stagger?: number;
  /** Animate only once (default) vs. every time it enters the viewport. */
  once?: boolean;
  /** Viewport position that triggers the reveal (ScrollTrigger `start`). */
  start?: string;
}

/** Resolve a variant into the "from" state gsap animates out of. */
function variantFrom(variant: RevealVariant): gsap.TweenVars {
  switch (variant) {
    case "fade-down":
      return { opacity: 0, y: -28 };
    case "fade":
      return { opacity: 0 };
    case "blur":
      return { opacity: 0, filter: "blur(14px)" };
    case "scale":
      return { opacity: 0, scale: 0.94 };
    case "slide-start":
      return { opacity: 0, x: -36 };
    case "slide-end":
      return { opacity: 0, x: 36 };
    case "mask-up":
      // Used together with an overflow-hidden parent (see TextReveal/sections).
      return { opacity: 0, y: "120%" };
    case "fade-up":
    default:
      return { opacity: 0, y: 28 };
  }
}

export function Reveal({
  children,
  as,
  className,
  variant = "fade-up",
  delay = 0,
  duration = 0.8,
  stagger,
  once = true,
  start = "top 85%",
}: RevealProps) {
  const Tag = (as ?? "div") as ElementType;
  const ref = useRef<HTMLElement>(null);
  const motionEnabled = isMarketingMotionEnabled();

  useGSAP(
    () => {
      if (!motionEnabled) return;

      const el = ref.current;
      if (!el) return;

      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (prefersReduced) return; // leave content fully visible

      // When stagger is set, always animate direct children so CSS
      // `[&>*]:opacity-0` and GSAP targets stay aligned (a single child
      // used to leave content permanently invisible).
      const animateChildren =
        typeof stagger === "number" && el.children.length > 0;
      const targets = animateChildren
        ? (Array.from(el.children) as HTMLElement[])
        : el;

      const ctx = gsap.context(() => {
        gsap.set(targets, variantFrom(variant));
        gsap.to(targets, {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          filter: "blur(0px)",
          duration,
          delay,
          stagger: typeof stagger === "number" ? stagger : 0,
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start,
            toggleActions: once ? "play none none none" : "play none none reverse",
          },
        });
      }, el);

      return () => ctx.revert();
    },
    { scope: ref },
  );

  const hideUntilReveal =
    motionEnabled &&
    (typeof stagger === "number"
      ? "motion-safe:[&>*]:opacity-0"
      : "motion-safe:opacity-0");

  return (
    <Tag
      ref={ref}
      className={cn(
        hideUntilReveal,
        className,
      )}
    >
      {children}
    </Tag>
  );
}
