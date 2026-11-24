"use client";

import { useEffect, useRef } from "react";

import { scrollTocItemIntoView } from "./toc-scroll";

/**
 * When `activeId` changes, scroll the TOC list so the active link stays visible
 * and approximately centered — without window scroll listeners.
 */
export function useTocAutoScroll(
  activeId: string,
  listRef: React.RefObject<HTMLElement | null>,
): void {
  const prevActiveIdRef = useRef<string | null>(null);

  useEffect(() => {
    const container = listRef.current;
    if (!activeId || !container) return;

    const prev = prevActiveIdRef.current;
    prevActiveIdRef.current = activeId;

    if (prev === null || prev === activeId) return;

    const activeEl = container.querySelector<HTMLElement>(
      `[data-toc-id="${CSS.escape(activeId)}"]`,
    );
    if (!activeEl) return;

    scrollTocItemIntoView(container, activeEl);
  }, [activeId, listRef]);
}
