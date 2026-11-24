"use client";

/**
 * ============================================================================
 * CLINICK — RESUME BOOKING PILL (spec §1, §B — abandoned-draft recovery)
 * ============================================================================
 * A compact, floating affordance that appears whenever the patient has a
 * resumable booking draft but isn't on `/booking` (e.g. they navigated away to
 * browse more doctors). One tap resumes the flow — the "hidden" CRO lever that
 * recovers abandoned bookings.
 *
 * Client-only (reads the persisted draft); renders nothing on the server or
 * when no resumable draft exists, so it never causes hydration mismatch.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarClock } from "lucide-react";

import { useBookingSession } from "@/hooks/useBookingSession";
import { cn } from "@/lib/utils";

export function ResumeBookingPill({ className }: { className?: string }) {
  const { resumable } = useBookingSession();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  // Avoid SSR/CSR mismatch: only render after hydration (deferred off the
  // synchronous effect body to avoid a render cascade).
  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Hide on the booking page itself (the draft is already in view there).
  if (!mounted || !resumable || pathname === "/booking") return null;

  return (
    <a
      href="/booking"
      className={cn(
        "fixed bottom-5 z-40 inline-flex items-center gap-2 rounded-full border border-brand/30 bg-card/90 px-4 py-2.5 text-sm font-semibold shadow-float backdrop-blur",
        "start-1/2 -translate-x-1/2 rtl:translate-x-1/2",
        "animate-[fade-in_0.3s_ease-out] transition-transform hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        className,
      )}
    >
      <CalendarClock className="size-4 text-brand" aria-hidden="true" />
      <span>ادامهٔ رزرو ناقص</span>
    </a>
  );
}
