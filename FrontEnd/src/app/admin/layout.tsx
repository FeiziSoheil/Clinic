"use client";

import {
  BarChart3,
  CalendarOff,
  LayoutDashboard,
  MessageSquareText,
  Newspaper,
  Stethoscope,
} from "lucide-react";

import { RequireAuth } from "@/components/shared/RequireAuth";
import { AppShell } from "@/components/shared/panel/AppShell";
import type { NavItem } from "@/types/nav";

/** Admin navigation shown in the sidebar. */
const navItems: NavItem[] = [
  { href: "/admin/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/admin/doctors", label: "پزشکان", icon: Stethoscope },
  { href: "/admin/leaves", label: "مرخصی‌ها", icon: CalendarOff },
  { href: "/admin/reviews", label: "نظرات", icon: MessageSquareText },
  { href: "/admin/articles", label: "مقالات", icon: Newspaper },
  {
    href: "/admin/financial-reports",
    label: "گزارش‌های مالی",
    icon: BarChart3,
  },
];

/**
 * Layout for all admin routes.
 *
 * Guards the subtree so only authenticated users with the `ADMIN` role can
 * access it, then renders the shared floating AppShell.
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={["ADMIN"]}>
      <AppShell navItems={navItems} roleLabel="پنل مدیریت">
        {children}
      </AppShell>
    </RequireAuth>
  );
}
