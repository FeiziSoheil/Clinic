"use client";

/**
 * ============================================================================
 * CLINICK — SITE HEADER
 * ============================================================================
 * Transparent, sticky navigation that adopts a blurred glass surface once the
 * visitor scrolls past the hero. Hosts the brand mark, primary nav (CMS-driven),
 * a light/dark toggle, the "ورود به سامانه" entry to the Enterprise system, and
 * the ever-present primary "رزرو نوبت" CTA. Includes a fully accessible mobile
 * sheet menu.
 * ============================================================================
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  X,
  LogIn,
  CalendarCheck,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { pickLocalized } from "@/lib/marketing/locale";
import type {
  MarketingSettings,
  NavItem,
  Locale,
  CTA,
} from "@/lib/marketing/types";
import { BrandLogo } from "@/components/marketing/ui/BrandLogo";
import { CTALink } from "@/components/marketing/ui/CTALink";
import {
  PATIENT_NAV_ITEMS,
  PATIENT_PANEL_HOME,
} from "@/lib/patient-nav";
import { useAuthStore } from "@/store/authStore";
import { ThemeToggle } from "./ThemeToggle";

/** Hash-only CMS links become root-anchored so they work from any public page. */
function resolveNavHref(href: string) {
  if (href.startsWith("#")) return `/${href}`;
  return href;
}

export function SiteHeader({
  settings,
  nav,
  locale,
  bookCta,
}: {
  settings: MarketingSettings;
  nav: NavItem[];
  locale: Locale;
  bookCta: CTA;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const user = useAuthStore((state) => state.user);
  const [hydrated, setHydrated] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  // Avoid flashing the guest “ورود” CTA before persisted auth rehydrates.
  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    setHydrated(useAuthStore.persist.hasHydrated());
    return unsub;
  }, []);

  // Glass surface appears as soon as the hero starts leaving the viewport.
  // Off the landing page, keep the solid glass chrome from the first paint.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Lock body scroll while the mobile sheet is open.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Client navigations (e.g. doctor profile → list) must dismiss the sheet.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const solid = scrolled || !isHome;
  const isPatient = hydrated && user?.role === "PATIENT";

  return (
    <header className="sticky top-0 z-40 w-full">
      {/*
        Glass/blur lives on the top bar only — not on this wrapper. `backdrop-filter`
        on an ancestor makes `position:fixed` children position against that box,
        so the mobile sheet would squeeze page content instead of overlaying it.
      */}
      <div
        className={cn(
          "w-full transition-all duration-500",
          solid
            ? "marketing-glass border-b border-border/60 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]"
            : "border-b border-transparent bg-transparent",
        )}
      >
      <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-3 px-5 sm:px-8 lg:h-18 lg:gap-4 lg:px-10">
        <Link
          href="/"
          aria-label={pickLocalized(settings.clinicName, locale)}
          data-cursor="hover"
          className="shrink-0"
        >
          <BrandLogo settings={settings} locale={locale} className="whitespace-nowrap" />
        </Link>

        {/* Desktop nav */}
        <nav
          aria-label="ناوبری اصلی"
          className="hidden min-w-0 items-center justify-center gap-0.5 lg:flex"
        >
          {nav.map((item) => (
            <Link
              key={item.href}
              href={resolveNavHref(item.href)}
              data-cursor="hover"
              className="relative whitespace-nowrap rounded-lg px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground xl:px-3.5"
            >
              {pickLocalized(item.label, locale)}
            </Link>
          ))}
        </nav>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <ThemeToggle className="hidden sm:grid" />
          {isPatient ? (
            <Link
              href={PATIENT_PANEL_HOME}
              data-cursor="hover"
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/50 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:inline-flex"
            >
              <LayoutDashboard className="size-4 shrink-0" />
              <span>پنل من</span>
            </Link>
          ) : (
            <Link
              href="/login"
              data-cursor="hover"
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/50 px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted sm:inline-flex"
            >
              <LogIn className="size-4 shrink-0" />
              <span>ورود به سامانه</span>
            </Link>
          )}
          <CTALink
            cta={bookCta}
            locale={locale}
            size="default"
            className="hidden whitespace-nowrap sm:inline-flex"
          />
          {/* Mobile menu trigger */}
          <button
            type="button"
            aria-label="باز کردن منو"
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen(true)}
            data-cursor="hover"
            className="grid size-10 place-items-center rounded-full border border-border/70 bg-background/50 text-foreground lg:hidden"
          >
            <Menu className="size-5" />
          </button>
        </div>
      </div>
      </div>

      {/* Mobile sheet — sibling of the glass bar, not a descendant of backdrop-filter */}
      <div
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="منوی موبایل"
        className={cn(
          "fixed inset-0 z-50 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        {/* backdrop */}
        <div
          onClick={() => setOpen(false)}
          className={cn(
            "absolute inset-0 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        {/* panel */}
        <div
          className={cn(
            "absolute inset-y-0 ltr:right-0 rtl:left-0 flex w-[88%] max-w-sm flex-col bg-background shadow-2xl transition-transform duration-300 ease-out",
            open ? "translate-x-0" : "ltr:translate-x-full rtl:-translate-x-full",
          )}
        >
          <div className="flex h-16 items-center justify-between border-b border-border px-5">
            <BrandLogo settings={settings} locale={locale} />
            <button
              type="button"
              aria-label="بستن منو"
              onClick={() => setOpen(false)}
              className="grid size-10 place-items-center rounded-full border border-border/70 text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="ناوبری موبایل">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={resolveNavHref(item.href)}
                onClick={() => setOpen(false)}
                className="block rounded-xl px-4 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-muted"
              >
                {pickLocalized(item.label, locale)}
              </Link>
            ))}
            {isPatient && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="px-4 pb-2 text-xs font-medium text-muted-foreground">
                  پنل بیمار
                </p>
                {PATIENT_NAV_ITEMS.filter((item) => item.href !== "/doctors").map(
                  (item) => {
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-4 py-3.5 text-base font-medium text-foreground transition-colors hover:bg-muted"
                      >
                        <Icon className="size-5 shrink-0 text-muted-foreground" />
                        {item.label}
                      </Link>
                    );
                  },
                )}
              </div>
            )}
          </nav>

          <div className="flex flex-col gap-3 border-t border-border p-5">
            <CTALink
              cta={bookCta}
              locale={locale}
              className="w-full justify-center"
            />
            {isPatient ? (
              <Link
                href={PATIENT_PANEL_HOME}
                onClick={() => setOpen(false)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground"
              >
                <LayoutDashboard className="size-4" />
                بازگشت به پنل
              </Link>
            ) : (
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border text-sm font-medium text-foreground"
              >
                <LogIn className="size-4" />
                ورود به سامانه
              </Link>
            )}
            <div className="flex items-center justify-between pt-1">
              <ThemeToggle />
              <a
                href={`tel:${settings.primaryPhone}`}
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground"
              >
                <CalendarCheck className="size-4 text-brand" />
                {settings.primaryPhone}
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
