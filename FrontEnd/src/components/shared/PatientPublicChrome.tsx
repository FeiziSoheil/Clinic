"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { PatientBottomNav } from "@/components/shared/PatientBottomNav";
import {
  isPatientPublicBrowsePath,
  PATIENT_BOTTOM_NAV_ITEMS,
} from "@/lib/patient-nav";
import { useAuthStore } from "@/store/authStore";

/**
 * Restores patient mobile navigation on public doctor/booking pages.
 *
 * `/doctors` is the PATIENT post-login home ({@link getRoleHomePath}) but lives
 * under `(public)`, so the authenticated patient layout (and its bottom tabs)
 * is not mounted. Without this chrome, patients lose every link back into
 * appointments / records / wallet.
 *
 * Guests and staff see nothing. Desktop (`md+`) relies on the SiteHeader
 * “پنل من” CTA instead.
 */
export function PatientPublicChrome() {
  const pathname = usePathname();
  const user = useAuthStore((state) => state.user);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const unsub = useAuthStore.persist.onFinishHydration(() => {
      setHydrated(true);
    });
    setHydrated(useAuthStore.persist.hasHydrated());
    return unsub;
  }, []);

  if (!hydrated || user?.role !== "PATIENT") {
    return null;
  }

  if (!isPatientPublicBrowsePath(pathname)) {
    return null;
  }

  return (
    <>
      {/* Keeps the marketing footer clear of the fixed bottom tabs on mobile. */}
      <div
        className="h-[calc(5.5rem+env(safe-area-inset-bottom))] md:hidden"
        aria-hidden
      />
      <PatientBottomNav items={PATIENT_BOTTOM_NAV_ITEMS} />
    </>
  );
}

export default PatientPublicChrome;
