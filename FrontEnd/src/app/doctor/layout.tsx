"use client";

import {
  CalendarDays,
  CalendarOff,
  ClipboardList,
  FileText,
  LayoutDashboard,
  MessageSquareText,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";

import { RequireAuth } from "@/components/shared/RequireAuth";
import { AppShell } from "@/components/shared/panel/AppShell";
import type { NavItem } from "@/types/nav";

/** Doctor navigation shown in the sidebar. */
const navItems: NavItem[] = [
  { href: "/doctor/dashboard", label: "داشبورد", icon: LayoutDashboard },
  { href: "/doctor/queue", label: "صف بیماران", icon: ClipboardList },
  { href: "/doctor/patients", label: "بیماران من", icon: Users },
  { href: "/doctor/prescriptions", label: "نسخه‌ها", icon: FileText },
  { href: "/doctor/reviews", label: "نظرات", icon: MessageSquareText },
  { href: "/doctor/shifts", label: "برنامه و تنظیمات", icon: CalendarDays },
  { href: "/doctor/leaves", label: "مرخصی‌ها", icon: CalendarOff },
  { href: "/doctor/receptionists", label: "منشی‌ها", icon: Users },
  { href: "/doctor/earnings", label: "درآمد", icon: Wallet },
];

/**
 * Layout for all doctor routes.
 *
 * Guards the subtree so only authenticated users with the `DOCTOR` role can
 * access it, then renders the shared floating AppShell.
 */
export default function DoctorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={["DOCTOR"]}>
      <AppShell
        navItems={navItems}
        title="Clinick"
        roleLabel="پنل پزشک"
        accentIcon={Stethoscope}
      >
        {children}
      </AppShell>
    </RequireAuth>
  );
}
