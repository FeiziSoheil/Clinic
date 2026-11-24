import {
  CalendarDays,
  FileText,
  Home,
  Pill,
  Wallet,
} from "lucide-react";

import type { NavItem } from "@/types/nav";

/**
 * Canonical patient destinations shared by the authenticated patient shell and
 * the public doctors/booking chrome (so a PATIENT is never stranded without a
 * way back into their panel).
 *
 * Note: `/profile` is intentionally omitted — there is no patient profile route
 * yet; account controls live in {@link UserMenu}.
 */
export const PATIENT_NAV_ITEMS: NavItem[] = [
  { href: "/doctors", label: "پزشکان", shortLabel: "پزشکان", icon: Home },
  {
    href: "/appointments",
    label: "نوبت‌های من",
    shortLabel: "نوبت‌ها",
    icon: CalendarDays,
  },
  {
    href: "/prescriptions",
    label: "نسخه‌ها",
    shortLabel: "نسخه‌ها",
    icon: Pill,
  },
  {
    href: "/records",
    label: "سوابق پزشکی",
    shortLabel: "سوابق",
    icon: FileText,
  },
  { href: "/wallet", label: "کیف پول", shortLabel: "کیف پول", icon: Wallet },
];

/**
 * Thumb-reachable primary tabs on mobile. Same set as the top navbar — profile
 * stays out of the bar so five destinations remain comfortable.
 */
export const PATIENT_BOTTOM_NAV_ITEMS = PATIENT_NAV_ITEMS;

/** Operational patient-panel entry used by public “بازگشت به پنل” CTAs. */
export const PATIENT_PANEL_HOME = "/appointments";

/**
 * Public routes where a logged-in PATIENT should keep patient navigation even
 * though the page lives under the marketing `(public)` shell.
 */
export function isPatientPublicBrowsePath(pathname: string): boolean {
  return (
    pathname === "/doctors" ||
    pathname.startsWith("/doctors/") ||
    pathname === "/booking" ||
    pathname.startsWith("/booking/")
  );
}
