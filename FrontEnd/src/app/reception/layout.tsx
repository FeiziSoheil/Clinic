"use client";

import { Calendar, ClipboardList, Clock, Users } from "lucide-react";

import { RequireAuth } from "@/components/shared/RequireAuth";
import { AppShell } from "@/components/shared/panel/AppShell";
import type { NavItem } from "@/types/nav";

/**
 * Receptionist navigation shown in the sidebar.
 *
 * Only the live queue route exists today (it also hosts the waiting list and
 * walk-in registration). Walk-in & cashier actions are performed inline from
 * the queue page, so they don't have their own routes yet.
 */
const navItems: NavItem[] = [
  { href: "/reception/queue", label: "صف زنده", icon: ClipboardList },
  { href: "/reception/timeline", label: "خط زمانی", icon: Clock },
  { href: "/reception/calendar", label: "تقویم ماهانه", icon: Calendar },
  { href: "/reception/waiting-list", label: "لیست انتظار", icon: Users },
];

/**
 * Layout for all receptionist routes.
 *
 * Guards the subtree so only authenticated `RECEPTIONIST` (or `DOCTOR`) users
 * can access it, then renders the shared floating AppShell (PanelTopbar via
 * AppShell). Doctors are permitted because the queue page is doctor-scoped
 * (`GET /doctors/me/schedule`).
 */
export default function ReceptionLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={["RECEPTIONIST", "DOCTOR"]}>
      <AppShell navItems={navItems} roleLabel="پنل منشی">
        {children}
      </AppShell>
    </RequireAuth>
  );
}
