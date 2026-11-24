/**
 * ============================================================================
 * CLINICK — TRUST BAR
 * ============================================================================
 * A compact, premium glass band that lands immediately after the hero. It
 * front-loads credibility with icons + numbers + compliance badges so a
 * first-time visitor trusts the platform within the first screen.
 *
 * Self-contained localized copy: this is product-level trust messaging (not
 * clinic operational data), so it lives here rather than in the CMS model.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { toPersianDigitsIfFa } from "@/components/marketing/ui/star-utils";
import type { Locale } from "@/lib/marketing/types";

interface TrustItem {
  icon: string;
  /** Optional number shown in brand color. */
  figure?: string;
  label: { fa: string; en: string };
}

const ITEMS: TrustItem[] = [
  { icon: "BadgeCheck", figure: "350+", label: { fa: "پزشک تأیید‌شده", en: "Verified doctors" } },
  { icon: "FileText", figure: "۵۰هزار+", label: { fa: "نسخهٔ الکترونیک", en: "E-prescriptions" } },
  { icon: "LockKeyhole", figure: "AES-۲۵۶", label: { fa: "پرونده رمزنگاری‌شده", en: "Encrypted records" } },
  { icon: "CalendarCheck2", figure: "۱۲۰هزار+", label: { fa: "نوبت موفق", en: "Appointments" } },
  { icon: "Star", figure: "۴.۹", label: { fa: "میانگین امتیاز", en: "Average rating" } },
  { icon: "Smile", figure: "۹۸٪", label: { fa: "رضایت بیمار", en: "Patient satisfaction" } },
];

export function TrustBarSection({ locale }: { locale: Locale }) {
  return (
    <Section tone="default" className="!py-10 sm:!py-12">
      <Reveal variant="fade-up" stagger={0.06}>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border/70 bg-border/70 shadow-soft sm:grid-cols-3 lg:grid-cols-6">
          {ITEMS.map((item) => (
            <div
              key={item.label.fa}
              className="flex flex-col items-center gap-2 bg-background px-4 py-6 text-center"
            >
              <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/10">
                <Icon name={item.icon} className="size-5" />
              </span>
              {item.figure ? (
                <span className="text-lg font-extrabold tracking-tight text-foreground font-vazir">
                  {toPersianDigitsIfFa(item.figure, locale)}
                </span>
              ) : null}
              <span className="text-xs leading-5 text-muted-foreground font-vazir">
                {locale === "en" ? item.label.en : item.label.fa}
              </span>
            </div>
          ))}
        </div>
      </Reveal>

      {/* Compliance / certification badges */}
      <Reveal variant="fade" delay={0.2}>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
          {[
            { fa: "تأییدیه نظام پزشکی", en: "Medical Council Verified" },
            { fa: "مطابق با استانداردهای حفظ حریم خصوصی سلامت", en: "Healthcare privacy compliant" },
            { fa: "رمزنگاری AES-۲۵۶", en: "AES-256 encryption" },
            { fa: "پشتیبانی ۲۴/۷", en: "24/7 support" },
          ].map((b) => (
            <span key={b.fa} className="inline-flex items-center gap-1.5">
              <Icon name="ShieldCheck" className="size-4 text-brand" />
              {locale === "en" ? b.en : b.fa}
            </span>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
