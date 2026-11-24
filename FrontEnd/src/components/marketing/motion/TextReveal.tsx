"use client";

/**
 * ============================================================================
 * CLINICK — TEXT REVEAL
 * ============================================================================
 * Splits a heading/paragraph into words and reveals each word from behind a
 * mask on scroll — the signature "premium" heading animation seen across the
 * reference brands. Works for both RTL (Farsi) and LTR (English) copy.
 *
 * Accessibility: words are real text nodes wrapped in spans, so the reading
 * order and semantics are fully preserved. Reduced-motion users see the text
 * instantly without any transform.
 * ============================================================================
 */

import { useRef, type ElementType } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { isMarketingMotionEnabled } from "@/lib/motion/config";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

export interface TextRevealProps {
  text: string;
  /** Element/tag to render. Defaults to a `span` so it can sit inside headings. */
  as?: ElementType;
  className?: string;
  /**
   * Paint styles applied to each animated word (e.g. gradient + bg-clip-text).
   * Must live on the word node — nesting bg-clip-text above overflow/transform
   * masks makes the text invisible (transparent fill never composites).
   */
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  /** Highlight this phrase in the brand gradient (e.g. the hero "highlight"). */
  highlight?: string;
  highlightClassName?: string;
  start?: string;
  once?: boolean;
}

export function TextReveal({
  text,
  as = "span",
  className,
  wordClassName,
  delay = 0,
  stagger = 0.04,
  duration = 0.9,
  highlight,
  highlightClassName,
  start = "top 85%",
  once = true,
}: TextRevealProps) {
  const Tag = (as ?? "span") as ElementType;
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

      const words = el.querySelectorAll<HTMLElement>("[data-word]");
      if (prefersReduced || words.length === 0) return;

      const ctx = gsap.context(() => {
        // Show the root (CSS motion-safe:opacity-0 pre-hides first paint).
        // Words stay clipped via yPercent until the reveal tween runs.
        gsap.set(el, { opacity: 1 });
        gsap.set(words, { yPercent: 120 });
        gsap.to(words, {
          yPercent: 0,
          duration,
          delay,
          stagger,
          ease: "power4.out",
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

  // Split into words while optionally wrapping a highlight phrase in brand ink.
  const segments: { text: string; isHighlight: boolean }[] = (() => {
    if (highlight && text.includes(highlight)) {
      const [before, ...rest] = text.split(highlight);
      const after = rest.join(highlight);
      return [
        { text: before, isHighlight: false },
        { text: highlight, isHighlight: true },
        { text: after, isHighlight: false },
      ].filter((s) => s.text.length > 0);
    }
    return [{ text, isHighlight: false }];
  })();

  return (
    <Tag
      ref={ref}
      className={cn(motionEnabled && "motion-safe:opacity-0", className)}
      aria-label={text}
    >
      {segments.map((segment, sIndex) => {
        const words = segment.text.split(/(\s+)/);
        return (
          <span key={sIndex}>
            {words.map((word, wIndex) =>
              /\s+/.test(word) ? (
                // Preserve whitespace between words without animating it.
                <span key={`s-${wIndex}`}>{word}</span>
              ) : (
                <span
                  key={`w-${wIndex}`}
                  className="inline-block overflow-hidden align-bottom"
                  aria-hidden="true"
                >
                  <span
                    data-word
                    className={cn(
                      "inline-block will-change-transform",
                      wordClassName,
                      segment.isHighlight && highlightClassName,
                    )}
                  >
                    {word}
                  </span>
                </span>
              ),
            )}
          </span>
        );
      })}
    </Tag>
  );
}
