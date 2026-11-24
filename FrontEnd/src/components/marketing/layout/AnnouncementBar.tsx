"use client";

/**
 * ============================================================================
 * CLINICK — ANNOUNCEMENT BAR
 * ============================================================================
 * A slim, branded strip above the header that cycles through important notices
 * (24/7 admission, online booking, accepted insurances, …). Auto-rotates with a
 * soft fade and is keyboard-pausable on focus. Content is fully CMS-driven.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/marketing/ui/icon";
import { pickLocalized } from "@/lib/marketing/locale";
import { cn } from "@/lib/utils";
import type { Announcement, Locale } from "@/lib/marketing/types";

export function AnnouncementBar({
  items,
  locale,
}: {
  items: Announcement[];
  locale: Locale;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || items.length <= 1) return;
    const id = setInterval(
      () => setIndex((i) => (i + 1) % items.length),
      4000,
    );
    return () => clearInterval(id);
  }, [paused, items.length]);

  if (items.length === 0) return null;
  const current = items[index] ?? items[0];

  return (
    <div
      className="relative z-50 flex h-10 items-center justify-center gap-2 overflow-hidden bg-foreground px-4 text-center text-[0.8rem] text-background"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div
        key={current.id}
        className="flex items-center gap-2"
      >
        {current.icon ? (
          <Icon name={current.icon} className="size-3.5 text-[var(--gold)]" />
        ) : null}
        <span className="font-medium">{pickLocalized(current.text, locale)}</span>
      </div>
      {/* position dots */}
      {items.length > 1 ? (
        <span className="absolute bottom-1 flex gap-1 ltr:right-3 rtl:left-3">
          {items.map((item, i) => (
            <span
              key={item.id}
              className={cn(
                "size-1 rounded-full",
                i === index ? "w-3 bg-background" : "bg-background/40",
              )}
            />
          ))}
        </span>
      ) : null}
    </div>
  );
}
