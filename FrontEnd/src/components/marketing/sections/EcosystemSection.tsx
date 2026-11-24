"use client";

/**
 * ============================================================================
 * CLINICK — PLATFORM ECOSYSTEM
 * ============================================================================
 * Explains the platform as one connected ecosystem of three roles. Three
 * interactive columns (Patient / Doctor / Secretary) live on a shared canvas;
 * the focused column lifts and reveals its dashboard preview + capabilities
 * while the others recede — communicating "one platform, three tools that talk
 * to each other".
 * ============================================================================
 */

import { useState } from "react";
import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { DashboardMockup, type DashboardVariant } from "@/components/marketing/ui/DashboardMockup";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/marketing/types";

interface Role {
  id: DashboardVariant;
  icon: string;
  role: { fa: string; en: string };
  tagline: { fa: string; en: string };
  capabilities: { fa: string; en: string }[];
}

const ROLES: Role[] = [
  {
    id: "patient",
    icon: "HeartPulse",
    role: { fa: "بیمار", en: "Patient" },
    tagline: { fa: "همه‌چیز برای سلامت شما", en: "Everything for your health" },
    capabilities: [
      { fa: "رزرو و مدیریت نوبت", en: "Book & manage appointments" },
      { fa: "پرونده و نتایج آنلاین", en: "Records & online results" },
      { fa: "نسخهٔ دیجیتال", en: "Digital prescriptions" },
    ],
  },
  {
    id: "doctor",
    icon: "Stethoscope",
    role: { fa: "پزشک", en: "Doctor" },
    tagline: { fa: "تمرکز روی درمان، نه کاغذبازی", en: "Focus on care, not paperwork" },
    capabilities: [
      { fa: "صف ویزیت هوشمند", en: "Smart visit queue" },
      { fa: "پروندهٔ الکترونیک بیمار", en: "Patient EHR" },
      { fa: "صدور نسخهٔ آنلاین", en: "Online prescribing" },
    ],
  },
  {
    id: "secretary",
    icon: "CalendarCheck2",
    role: { fa: "پذیرش و منشی", en: "Reception" },
    tagline: { fa: "کلینیک را روان برگزار کنید", en: "Keep the clinic running" },
    capabilities: [
      { fa: "تقویم مرکزی نوبت‌ها", en: "Central calendar" },
      { fa: "پذیرش سریع بیمار", en: "Fast patient intake" },
      { fa: "مدیریت اتاق انتظار", en: "Waiting-room control" },
    ],
  },
];

export function EcosystemSection({ locale }: { locale: Locale }) {
  const [focused, setFocused] = useState<DashboardVariant | null>(null);

  return (
    <Section id="ecosystem" tone="default">
      <SectionHeading
        eyebrow={{ fa: "اکوسیستم پلتفرم", en: "Platform ecosystem" }}
        title={{ fa: "یک پلتفرم، سه نقش متصل", en: "One platform, three connected roles" }}
        description={{
          fa: "بیمار، پزشک و پذیرش روی یک پایگاه‌دادهٔ مشترک کار می‌کنند؛ داده‌ها به‌صورت لحظه‌ای بین همهٔ نقش‌ها جریان دارد.",
          en: "Patient, doctor and reception share one data backbone — information flows in real time across every role.",
        }}
        locale={locale}
      />

      <Reveal variant="fade-up" delay={0.1} className="mt-12">
        <div
          className="grid items-start gap-5 md:grid-cols-3"
          onMouseLeave={() => setFocused(null)}
        >
          {ROLES.map((role) => {
            const isFocused = focused === role.id;
            const isDimmed = focused !== null && !isFocused;
            return (
              <article
                key={role.id}
                onMouseEnter={() => setFocused(role.id)}
                onFocusCapture={() => setFocused(role.id)}
                tabIndex={0}
                className={cn(
                  "group relative flex flex-col gap-4 rounded-3xl border bg-card p-5 shadow-soft outline-none transition-all duration-500",
                  isFocused
                    ? "border-brand/50 -translate-y-1 shadow-card"
                    : "border-border/70",
                  isDimmed && "opacity-55 hover:opacity-100",
                )}
              >
                {/* Header */}
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/15 transition-transform duration-500 group-hover:scale-110 group-hover:-rotate-3">
                    <Icon name={role.icon} className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-foreground font-vazir">
                      {locale === "en" ? role.role.en : role.role.fa}
                    </h3>
                    <p className="text-xs text-muted-foreground font-vazir">
                      {locale === "en" ? role.tagline.en : role.tagline.fa}
                    </p>
                  </div>
                </div>

                {/* Mini dashboard preview — reveals on hover */}
                <div
                  className={cn(
                    "overflow-hidden rounded-2xl transition-all duration-500",
                    isFocused ? "max-h-[26rem] opacity-100" : "max-h-0 opacity-0 md:max-h-0",
                  )}
                >
                  <DashboardMockup variant={role.id} locale={locale} compact />
                </div>

                {/* Capabilities (always visible) */}
                <ul className="space-y-2">
                  {role.capabilities.map((c) => (
                    <li key={c.fa} className="flex items-center gap-2 text-sm text-muted-foreground font-vazir">
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                        <Icon name="Check" className="size-3" strokeWidth={3} />
                      </span>
                      {locale === "en" ? c.en : c.fa}
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>
      </Reveal>

      {/* Data flow ribbon */}
      <Reveal variant="fade" delay={0.2}>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 font-vazir">
            <Icon name="HeartPulse" className="size-4 text-brand" />
            {locale === "en" ? "Patient" : "بیمار"}
          </span>
          <Icon name="ArrowLeftRight" className="size-4 text-brand/60" />
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 font-vazir">
            <Icon name="Stethoscope" className="size-4 text-brand" />
            {locale === "en" ? "Doctor" : "پزشک"}
          </span>
          <Icon name="ArrowLeftRight" className="size-4 text-brand/60" />
          <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card px-4 py-2 font-vazir">
            <Icon name="CalendarCheck2" className="size-4 text-brand" />
            {locale === "en" ? "Reception" : "پذیرش"}
          </span>
          <span className="ms-2 hidden text-xs sm:inline">
            {locale === "en" ? "— synced in real time" : "— همگام به‌صورت لحظه‌ای"}
          </span>
        </div>
      </Reveal>
    </Section>
  );
}
