/**
 * ============================================================================
 * CLINICK — MARKETING SHELL
 * ============================================================================
 * The page-level chrome for the public clinic website: the rotating announcement
 * bar, the sticky glass header, the main content, and the footer.
 * Mounted once via `app/(public)/layout.tsx` so every public route
 * shares the same chrome.
 * ============================================================================
 */

import type { ReactNode } from "react";
import type { CTA, MarketingSettings, NavItem, Announcement, Locale } from "@/lib/marketing/types";
import { SmoothScroll } from "@/components/marketing/motion/SmoothScroll";
import { PatientPublicChrome } from "@/components/shared/PatientPublicChrome";
import { AnnouncementBar } from "./AnnouncementBar";
import { SiteHeader } from "./SiteHeader";
import { SiteFooter } from "./SiteFooter";
import type { MarketingContent } from "@/lib/marketing/types";

export interface MarketingShellProps {
  content: MarketingContent;
  children: ReactNode;
}

export function MarketingShell({ content, children }: MarketingShellProps) {
  const {
    settings,
    nav,
    announcements,
    hero,
    locale,
  }: {
    settings: MarketingSettings;
    nav: NavItem[];
    announcements: Announcement[];
    hero: { primaryCta: CTA };
    locale: Locale;
  } = content;

  return (
    <SmoothScroll>
      {/* Ambient background layers — subtle mesh + grain behind the whole page */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 marketing-bg-mesh"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 opacity-[0.035] marketing-noise mix-blend-overlay"
      />

      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-brand-foreground"
      >
        رفتن به محتوای اصلی
      </a>

      <AnnouncementBar items={announcements} locale={locale} />
      <SiteHeader
        settings={settings}
        nav={nav}
        locale={locale}
        bookCta={hero.primaryCta}
      />

      <main id="main" className="relative">
        {children}
      </main>

      <SiteFooter content={content} />
      {/* PATIENT bottom tabs on /doctors & /booking — guests unchanged. */}
      <PatientPublicChrome />
    </SmoothScroll>
  );
}
