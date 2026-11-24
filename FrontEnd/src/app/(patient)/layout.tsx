"use client";

import { PatientBottomNav } from "@/components/shared/PatientBottomNav";
import { RequireAuth } from "@/components/shared/RequireAuth";
import { TopNavbar } from "@/components/shared/TopNavbar";
import {
  PATIENT_BOTTOM_NAV_ITEMS,
  PATIENT_NAV_ITEMS,
} from "@/lib/patient-nav";

/**
 * Layout for all patient routes.
 *
 * Guards the subtree so only authenticated users with the `PATIENT` role can
 * access it, then renders a mobile-first shell: compact top bar + bottom tabs
 * below `md`, and the horizontal top navbar from `md` up.
 *
 * Note: `/doctors` itself lives under `(public)` (marketing shell). Logged-in
 * patients keep equivalent bottom-nav chrome there via
 * {@link PatientPublicChrome}.
 */
export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RequireAuth allowedRoles={["PATIENT"]}>
      <div className="flex min-h-dvh flex-col bg-background">
        <TopNavbar items={PATIENT_NAV_ITEMS} mobileNav="bottom" />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 md:px-6 md:pb-10 md:pt-6">
          {children}
        </main>
        <PatientBottomNav items={PATIENT_BOTTOM_NAV_ITEMS} />
      </div>
    </RequireAuth>
  );
}
