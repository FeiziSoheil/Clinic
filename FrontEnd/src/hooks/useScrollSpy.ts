"use client";

import { useEffect, useRef, useState } from "react";

const OBSERVER_OPTIONS: IntersectionObserverInit = {
  root: null,
  rootMargin: "-25% 0px -55% 0px",
  // Fewer thresholds → fewer observer callbacks while scrolling.
  threshold: [0, 1],
};

function pickClosestToViewportTop(
  entries: IntersectionObserverEntry[],
): string | null {
  if (entries.length === 0) return null;

  return entries
    .reduce((best, entry) => {
      const bestDist = Math.abs(best.boundingClientRect.top);
      const entryDist = Math.abs(entry.boundingClientRect.top);
      return entryDist < bestDist ? entry : best;
    })
    .target.id;
}

function pickFallback(sectionIds: string[]): string {
  const marker = window.innerHeight * 0.25;
  let active = sectionIds[0] ?? "";

  for (const id of sectionIds) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (el.getBoundingClientRect().top <= marker) {
      active = id;
    }
  }

  return active;
}

/**
 * Tracks which section id is active while scrolling via a single IntersectionObserver.
 */
export function useScrollSpy(sectionIds: string[]): string {
  const [activeId, setActiveId] = useState("");
  const intersectingRef = useRef<Map<string, IntersectionObserverEntry>>(
    new Map(),
  );
  const sectionIdsKey = sectionIds.join("\0");

  useEffect(() => {
    if (!sectionIds.length) {
      setActiveId("");
      return;
    }

    const elements = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (!elements.length) return;

    const updateActive = () => {
      const intersecting = Array.from(intersectingRef.current.values());
      const next =
        pickClosestToViewportTop(intersecting) ?? pickFallback(sectionIds);
      if (next) setActiveId((prev) => (prev === next ? prev : next));
    };

    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = entry.target.id;
        if (entry.isIntersecting) {
          intersectingRef.current.set(id, entry);
        } else {
          intersectingRef.current.delete(id);
        }
      }
      updateActive();
    }, OBSERVER_OPTIONS);

    for (const el of elements) {
      observer.observe(el);
    }

    updateActive();

    return () => {
      observer.disconnect();
      intersectingRef.current.clear();
    };
  }, [sectionIdsKey]);

  return activeId;
}
