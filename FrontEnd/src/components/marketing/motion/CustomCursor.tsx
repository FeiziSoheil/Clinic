"use client";

/**
 * ============================================================================
 * CLINICK — CUSTOM CURSOR
 * ============================================================================
 * A refined two-part cursor (a precise dot + a lagging ring) that adds a
 * "premium software" feel on desktop. It magnifies and tints over interactive
 * elements (links, buttons, [data-cursor]) to give clear hover feedback.
 *
 * GSAP notes:
 *  - `quickTo` only accepts a single property name (`x`, `y`, …). Combined
 *    keys like `"x,y"` and using `quickTo` for `scale` (which shares the
 *    transform matrix with x/y) spam "not eligible for reset" warnings.
 *  - Position uses separate `quickTo`s; hover scale uses a short `gsap.to`.
 * ============================================================================
 */

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

export function CustomCursor() {
  const dotRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (!finePointer || reducedMotion) return;

    const dot = dotRef.current;
    const ring = ringRef.current;
    if (!dot || !ring) return;

    gsap.set([dot, ring], { xPercent: -50, yPercent: -50, scale: 1 });

    const moveDotX = gsap.quickTo(dot, "x", { duration: 0.15, ease: "power3" });
    const moveDotY = gsap.quickTo(dot, "y", { duration: 0.15, ease: "power3" });
    const moveRingX = gsap.quickTo(ring, "x", { duration: 0.5, ease: "power3" });
    const moveRingY = gsap.quickTo(ring, "y", { duration: 0.5, ease: "power3" });

    let hovering = false;

    const onMove = (e: MouseEvent) => {
      moveDotX(e.clientX);
      moveDotY(e.clientY);
      moveRingX(e.clientX);
      moveRingY(e.clientY);
    };

    const onOver = (e: MouseEvent) => {
      const target = (e.target as HTMLElement)?.closest(
        "a, button, [role='button'], [data-cursor='hover'], input, textarea, select, label",
      );
      const next = Boolean(target);
      if (next === hovering) return;
      hovering = next;
      ring.classList.toggle("is-hovering", next);
      gsap.to(ring, {
        scale: next ? 1.8 : 1,
        duration: 0.3,
        ease: "power3.out",
        overwrite: "auto",
      });
    };

    const reveal = () => gsap.to([dot, ring], { opacity: 1, duration: 0.2 });
    const hide = () => gsap.to([dot, ring], { opacity: 0, duration: 0.2 });

    window.addEventListener("mousemove", reveal, { once: true });
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseover", onOver);
    document.addEventListener("mouseleave", hide);
    document.addEventListener("mouseenter", reveal);

    return () => {
      window.removeEventListener("mousemove", reveal);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseover", onOver);
      document.removeEventListener("mouseleave", hide);
      document.removeEventListener("mouseenter", reveal);
      gsap.killTweensOf([dot, ring]);
    };
  }, []);

  return (
    <>
      <div
        ref={dotRef}
        className="marketing-cursor-dot pointer-events-none fixed left-0 top-0 z-[9999] h-2 w-2 rounded-full bg-brand opacity-0"
        aria-hidden="true"
      />
      <div
        ref={ringRef}
        className="marketing-cursor-ring pointer-events-none fixed left-0 top-0 z-[9999] h-8 w-8 rounded-full border border-brand/50 opacity-0 transition-colors duration-300"
        aria-hidden="true"
      />
    </>
  );
}
