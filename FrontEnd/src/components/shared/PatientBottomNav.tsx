"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/types/nav";

interface PatientBottomNavProps {
  /** Primary destinations shown as thumb-reachable tabs on small screens. */
  items: NavItem[];
}

/**
 * Fixed bottom tab bar for the patient panel on viewports below `md`.
 *
 * Mirrors health-app patterns: icon + short label, active route highlight,
 * and home-indicator safe-area padding. Hidden from `md` up where the top
 * navbar shows the full link list.
 */
export function PatientBottomNav({ items }: PatientBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="ناوبری اصلی بیمار"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-between gap-0.5 px-1 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          const label = item.shortLabel ?? item.label;

          return (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[0.65rem] leading-tight transition-colors",
                  isActive
                    ? "font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "size-5 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                  aria-hidden
                />
                <span className="max-w-full truncate">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default PatientBottomNav;
