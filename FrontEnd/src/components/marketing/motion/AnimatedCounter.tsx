"use client";

/**
 * Counts a number up from zero when scrolled into view (GSAP + ScrollTrigger).
 * Renders a static value when marketing motion is disabled.
 */

import { useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { cn } from "@/lib/utils";
import { isAnimatedCounterEnabled } from "@/lib/motion/config";
import type { Locale } from "@/lib/marketing/types";

if (typeof window !== "undefined") {
  gsap.registerPlugin(useGSAP, ScrollTrigger);
}

/** Convert ASCII digits in a string to Persian (Farsi) numerals. */
function toPersianDigits(input: string): string {
  const persian = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  return input.replace(/\d/g, (d) => persian[Number(d)] ?? d);
}

function formatNumber(value: number, decimals: number, locale: Locale): string {
  const fixed = value.toFixed(decimals);
  const withSeparators = Number(fixed).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return locale === "fa" ? toPersianDigits(withSeparators) : withSeparators;
}

export interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  duration?: number;
  locale?: Locale;
  className?: string;
}

function AnimatedCounterMotion({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 2,
  locale = "fa",
  className,
}: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const prefersReduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      if (prefersReduced) {
        el.textContent = `${prefix}${formatNumber(value, decimals, locale)}${suffix}`;
        return;
      }

      const obj = { val: 0 };
      const ctx = gsap.context(() => {
        gsap.to(obj, {
          val: value,
          duration,
          ease: "power2.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
          onUpdate: () => {
            el.textContent = `${prefix}${formatNumber(obj.val, decimals, locale)}${suffix}`;
          },
        });
      }, el);

      return () => ctx.revert();
    },
    { scope: ref, dependencies: [value, decimals, duration, locale, prefix, suffix] },
  );

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {`${prefix}${formatNumber(0, decimals, locale)}${suffix}`}
    </span>
  );
}

export function AnimatedCounter(props: AnimatedCounterProps) {
  const {
    value,
    prefix = "",
    suffix = "",
    decimals = 0,
    locale = "fa",
    className,
  } = props;

  if (!isAnimatedCounterEnabled()) {
    return (
      <span className={cn("tabular-nums", className)}>
        {`${prefix}${formatNumber(value, decimals, locale)}${suffix}`}
      </span>
    );
  }

  return <AnimatedCounterMotion {...props} />;
}
