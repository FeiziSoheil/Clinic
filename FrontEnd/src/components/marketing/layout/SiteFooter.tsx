/**
 * ============================================================================
 * CLINICK — SITE FOOTER
 * ============================================================================
 * A calm, information-rich footer: brand identity, quick navigation, key
 * services & physicians, full contact (address/phone/email/branches/working
 * hours), accepted insurances and trust/legal badges. Every field is read from
 * the CMS content model.
 * ============================================================================
 */

import Link from "next/link";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { BrandLogo } from "@/components/marketing/ui/BrandLogo";
import { SocialIcon } from "@/components/marketing/ui/SocialIcon";
import { pickLocalized } from "@/lib/marketing/locale";
import type { MarketingContent } from "@/lib/marketing/types";

export function SiteFooter({ content }: { content: MarketingContent }) {
  const { settings, nav, services, locale } = content;

  return (
    <footer id="contact" className="relative mt-10 border-t border-border/60 bg-muted/40">
      {/* top accent line */}
      <div className="h-px w-full bg-gradient-to-l from-transparent via-brand/40 to-transparent" />

      <div className="mx-auto w-full max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
        <div className="grid grid-cols-2 gap-x-8 gap-y-12 md:grid-cols-3 lg:grid-cols-12">
          {/* Brand + about */}
          <div className="col-span-2 lg:col-span-4">
            <BrandLogo settings={settings} locale={locale} />
            <p className="mt-4 max-w-sm text-sm leading-7 text-muted-foreground">
              {pickLocalized(settings.description, locale)}
            </p>
            <div className="mt-5 flex items-center gap-2.5">
              {settings.socials.map((social) => {
                return (
                  <a
                    key={social.platform}
                    href={social.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={pickLocalized(social.label, locale)}
                    data-cursor="hover"
                    className="grid size-9 place-items-center rounded-full border border-border bg-background text-muted-foreground transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:text-brand"
                  >
                    <SocialIcon platform={social.platform} className="size-4" />
                  </a>
                );
              })}
            </div>
          </div>

          {/* Quick links */}
          <nav className="lg:col-span-2" aria-label="دسترسی سریع">
            <h3 className="mb-4 text-sm font-bold text-foreground">دسترسی سریع</h3>
            <ul className="space-y-2.5">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    data-cursor="hover"
                    className="text-sm text-muted-foreground transition-colors hover:text-brand"
                  >
                    {pickLocalized(item.label, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Services */}
          <nav className="lg:col-span-3" aria-label="خدمات">
            <h3 className="mb-4 text-sm font-bold text-foreground">خدمات کلینیک</h3>
            <ul className="space-y-2.5">
              {services.items.slice(0, 6).map((service) => (
                <li key={service.id}>
                  <Link
                    href={service.href}
                    data-cursor="hover"
                    className="text-sm text-muted-foreground transition-colors hover:text-brand"
                  >
                    {pickLocalized(service.title, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Contact */}
          <div className="col-span-2 lg:col-span-3">
            <h3 className="mb-4 text-sm font-bold text-foreground">تماس با ما</h3>
            <ul className="space-y-3.5 text-sm text-muted-foreground">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>{pickLocalized(settings.address, locale)}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <Phone className="size-4 shrink-0 text-brand" />
                <a href={`tel:${settings.primaryPhone}`} data-cursor="hover" className="hover:text-brand" dir="ltr">
                  {settings.primaryPhone}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <Mail className="size-4 shrink-0 text-brand" />
                <a href={`mailto:${settings.email}`} data-cursor="hover" className="hover:text-brand" dir="ltr">
                  {settings.email}
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 size-4 shrink-0 text-brand" />
                <span className="space-y-0.5">
                  {settings.workingHours.map((wh) => (
                    <span key={wh.day.fa} className="block">
                      {pickLocalized(wh.day, locale)}: {pickLocalized(wh.hours, locale)}
                    </span>
                  ))}
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Accepted insurances */}
        <div className="mt-12 border-t border-border/60 pt-8">
          <p className="mb-4 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
            بیمه‌های طرف قرارداد
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {settings.insurances.map((ins) => (
              <span
                key={ins.fa}
                className="rounded-full border border-border/70 bg-background px-4 py-1.5 text-sm text-muted-foreground"
              >
                {pickLocalized(ins, locale)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-7xl flex-col items-center justify-between gap-4 px-5 py-6 sm:flex-row sm:px-8 lg:px-10">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {pickLocalized(settings.clinicName, locale)}. تمامی حقوق محفوظ است.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            {settings.legalBadges.map((badge) => (
              <span
                key={badge.label.fa}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <span className="size-2 rounded-full bg-emerald-500/70" aria-hidden="true" />
                {pickLocalized(badge.label, locale)}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
