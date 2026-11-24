"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/shared/UserMenu";
import type { NavItem } from "@/types/nav";

interface TopNavbarProps {
  /** Navigation entries to render in the navbar. */
  items: NavItem[];
  /** Brand/app name shown on the left of the navbar. */
  title?: string;
  /**
   * How primary nav is exposed on small screens.
   * - `drawer` — hamburger + dropdown (default)
   * - `bottom` — primary tabs live in {@link PatientBottomNav}; this bar
   *   only shows brand + account controls on mobile
   */
  mobileNav?: "drawer" | "bottom";
}

/**
 * Renders a single top-bar navigation link with active-route highlighting.
 */
function TopNavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const Icon = item.icon;
  const isActive =
    pathname === item.href || pathname.startsWith(`${item.href}/`);

  return (
    <Link
      href={item.href}
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-primary/10 font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span>{item.label}</span>
    </Link>
  );
}

/**
 * Reusable sticky top navbar.
 *
 * Shows the brand and a horizontal list of nav links with active highlighting.
 * On mobile, either collapses into a hamburger drawer (`mobileNav="drawer"`)
 * or defers primary destinations to a bottom tab bar (`mobileNav="bottom"`).
 */
export function TopNavbar({
  items,
  title = "Clinick",
  mobileNav = "drawer",
}: TopNavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const useBottomTabs = mobileNav === "bottom";

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-16 md:px-6">
        {/* Brand + desktop nav */}
        <div className="flex min-w-0 items-center gap-6">
          <span className="truncate text-base font-semibold tracking-tight md:text-lg">
            {title}
          </span>

          <nav className="hidden items-center gap-1 md:flex">
            {items.map((item) => (
              <TopNavLink key={item.href} item={item} />
            ))}
          </nav>
        </div>

        {/* Account + optional mobile drawer toggle */}
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <div className={cn(useBottomTabs ? "block" : "hidden md:block")}>
            <UserMenu compact={useBottomTabs} />
          </div>
          {!useBottomTabs && (
            <Button
              variant="ghost"
              size="icon"
              className="size-11 md:hidden"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label="باز و بسته کردن منوی ناوبری"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? (
                <X className="size-6" />
              ) : (
                <Menu className="size-6" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Mobile dropdown panel (drawer mode only) */}
      {!useBottomTabs && mobileOpen && (
        <div className="border-t bg-background md:hidden">
          <nav className="flex flex-col gap-1 p-3">
            {items.map((item) => (
              <div key={item.href} onClick={() => setMobileOpen(false)}>
                <TopNavLink item={item} />
              </div>
            ))}
          </nav>
          <div className="border-t p-3">
            <UserMenu />
          </div>
        </div>
      )}
    </header>
  );
}

export default TopNavbar;
