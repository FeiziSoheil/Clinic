/**
 * ============================================================================
 * CLINICK — SECURITY & TRUST
 * ============================================================================
 * Healthcare runs on trust. A dedicated, premium dark band makes the platform's
 * security posture unmistakable: encrypted records, secure login, medical
 * privacy, backups, cloud infrastructure and 24/7 monitoring. A central shield
 * motif anchors a grid of security pillars.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import type { Locale } from "@/lib/marketing/types";

interface Pillar {
  icon: string;
  title: { fa: string; en: string };
  description: { fa: string; en: string };
}

const PILLARS: Pillar[] = [
  {
    icon: "LockKeyhole",
    title: { fa: "دادهٔ رمزنگاری‌شده", en: "Encrypted data" },
    description: { fa: "تمام اطلاعات پزشکی با AES-۲۵۶ رمزگذاری می‌شود.", en: "All medical data is encrypted with AES-256." },
  },
  {
    icon: "Fingerprint",
    title: { fa: "ورود امن", en: "Secure login" },
    description: { fa: "احراز هویت دومرحله‌ای و نشست‌های امن برای هر کاربر.", en: "Two-factor auth & secure sessions for every user." },
  },
  {
    icon: "ShieldHalf",
    title: { fa: "حریم خصوصی سلامت", en: "Medical privacy" },
    description: { fa: "دسترسی مبتنی بر نقش؛ فقط شما و تیم درمان می‌بینید.", en: "Role-based access — only you & your care team see data." },
  },
  {
    icon: "DatabaseBackup",
    title: { fa: "پشتیبان‌گیری خودکار", en: "Automatic backups" },
    description: { fa: "پرونده‌ها هر روز پشتیبان‌گیری و قابل بازیابی‌اند.", en: "Records are backed up daily and fully recoverable." },
  },
  {
    icon: "Cloud",
    title: { fa: "زیرساخت ابری", en: "Cloud infrastructure" },
    description: { fa: "میزبانی روی زیرساخت ابری امن و مقیاس‌پذیر.", en: "Hosted on secure, scalable cloud infrastructure." },
  },
  {
    icon: "Activity",
    title: { fa: "پایش ۲۴/۷", en: "24/7 monitoring" },
    description: { fa: "نظارت پیوسته و هشدار امنیتی در لحظه.", en: "Continuous surveillance with instant security alerts." },
  },
];

export function SecuritySection({ locale }: { locale: Locale }) {
  return (
    <Section id="security" tone="inverted" className="overflow-hidden">
      {/* Ambient glows on the dark band */}
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 size-[30rem] -translate-x-1/2 rounded-full bg-brand/25 opacity-40 blur-[120px]" />

      <div className="relative">
        <SectionHeading
          eyebrow={{ fa: "امنیت و اعتماد", en: "Security & trust" }}
          title={{ fa: "امنیت سلامت شما، اولویت ماست", en: "Your health security is our priority" }}
          description={{
            fa: "پرونده‌های پزشکی شما با استانداردهای بالای رمزنگاری و حریم خصوصی محافظت می‌شوند.",
            en: "Your medical records are protected by enterprise-grade encryption and privacy standards.",
          }}
          locale={locale}
          onDark
        />

        <div className="mt-14 grid items-center gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          {/* Shield hero */}
          <Reveal variant="scale" className="flex justify-center">
            <div className="relative grid size-56 place-items-center">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand/10" style={{ animationDuration: "3s" }} aria-hidden="true" />
              <span className="absolute inset-4 rounded-full border border-white/10" aria-hidden="true" />
              <span className="absolute inset-8 rounded-full border border-white/10" aria-hidden="true" />
              <div className="relative grid size-28 place-items-center rounded-3xl bg-gradient-to-br from-brand to-[var(--gradient-mid)] shadow-glow">
                <Icon name="ShieldCheck" className="size-12 text-white" strokeWidth={1.6} />
              </div>
              <span className="absolute -bottom-2 rounded-full bg-white/10 px-4 py-1.5 text-xs font-semibold text-white ring-1 ring-white/20 backdrop-blur font-vazir">
                {locale === "en" ? "AES-256 · Encrypted" : "AES-۲۵۶ · رمزنگاری‌شده"}
              </span>
            </div>
          </Reveal>

          {/* Pillars grid */}
          <Reveal variant="fade-up" stagger={0.07} className="grid gap-4 sm:grid-cols-2">
            {PILLARS.map((p) => (
              <div
                key={p.icon}
                className="group rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur transition-colors duration-300 hover:border-brand/40 hover:bg-white/10"
              >
                <span className="grid size-10 place-items-center rounded-xl bg-brand/20 text-brand ring-1 ring-brand/20 transition-transform duration-500 group-hover:scale-110">
                  <Icon name={p.icon} className="size-5" />
                </span>
                <h3 className="mt-3 text-sm font-bold text-white font-vazir">
                  {locale === "en" ? p.title.en : p.title.fa}
                </h3>
                <p className="mt-1 text-xs leading-6 text-white/70 font-vazir">
                  {locale === "en" ? p.description.en : p.description.fa}
                </p>
              </div>
            ))}
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
