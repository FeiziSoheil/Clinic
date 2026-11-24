"use client";

/**
 * ============================================================================
 * CLINICK — LENIS SMOOTH SCROLL PROVIDER
 * ============================================================================
 * Mounts a single Lenis instance for the whole marketing experience and wires
 * it into GSAP's ticker + ScrollTrigger so every scroll-driven animation stays
 * perfectly in lock-step with the smoothed scroll position.
 *
 * Accessibility: Lenis is disabled entirely when the user requests reduced
 * motion, leaving the browser's native (instant) scrolling in place.
 * ============================================================================
 */

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { isLenisSmoothScrollEnabled } from "@/lib/motion/config";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

export function SmoothScroll({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (!isLenisSmoothScrollEnabled()) return;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // Respect the OS-level motion preference — no smoothing, native scroll.
    if (prefersReduced) return;

    const lenis = new Lenis({
      duration: 1.15,
      // Easing modelled on a premium, slightly-overdamped feel.
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.5,
    });

    // Drive Lenis from the GSAP ticker (single RAF loop for the whole app).
    const onTick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    // Keep ScrollTrigger measurements in sync with the smoothed scroll.
    lenis.on("scroll", ScrollTrigger.update);

    return () => {
      gsap.ticker.remove(onTick);
      lenis.destroy();
    };
  }, []);

  return <>{children}</>;
}
