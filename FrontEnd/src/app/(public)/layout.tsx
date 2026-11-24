import type { ReactNode } from "react";

import { MarketingShell } from "@/components/marketing/layout/MarketingShell";
import { fetchMarketingContent } from "@/lib/marketing/cms-api";

/**
 * Shared chrome for every public-facing page: announcement bar, sticky
 * SiteHeader, footer, and ambient marketing background.
 *
 * Route group `(public)` does not affect URLs — `/`, `/doctors`, `/booking`,
 * etc. keep their paths while sharing this layout. Authenticated areas
 * (`admin`, `doctor`, `reception`, `(patient)`, `(auth)`) stay outside.
 */
export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const content = await fetchMarketingContent();

  return <MarketingShell content={content}>{children}</MarketingShell>;
}
