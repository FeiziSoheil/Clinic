/**
 * ============================================================================
 * CLINICK — BRAND LOGO
 * ============================================================================
 * Renders the clinic identity from CMS settings: a configured logo image when
 * present, otherwise a bespoke gradient monogram + wordmark. `onDark` flips the
 * wordmark to a high-contrast ink for use over dark/hero backgrounds.
 * ============================================================================
 */

import Image from "next/image";
import { cn } from "@/lib/utils";
import { pickLocalized } from "@/lib/marketing/locale";
import type { MarketingSettings, Locale } from "@/lib/marketing/types";

export interface BrandLogoProps {
  settings: MarketingSettings;
  locale: Locale;
  onDark?: boolean;
  className?: string;
}

export function BrandLogo({
  settings,
  locale,
  onDark = false,
  className,
}: BrandLogoProps) {
  const name = pickLocalized(settings.clinicName, locale);
  const mark = settings.logoMark ?? name.charAt(0);

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {settings.logoUrl ? (
        <Image
          src={settings.logoUrl}
          alt={name}
          width={36}
          height={36}
          className="size-9 rounded-xl object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brand to-[var(--gradient-mid)] text-base font-extrabold text-white shadow-lg shadow-brand/25"
        >
          {mark}
        </span>
      )}
      <span
        className={cn(
          "text-lg font-bold tracking-tight transition-colors",
          onDark ? "text-white" : "text-foreground",
        )}
      >
        {name}
      </span>
    </span>
  );
}
