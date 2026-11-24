"use client";

/**
 * ============================================================================
 * CLINICK — PRODUCT SHOWCASE
 * ============================================================================
 * The premium "show, don't tell" moment. Interactive tabs switch between the
 * three real product surfaces (Patient / Doctor / Secretary) rendered by the
 * shared {@link DashboardMockup}. Each panel pairs the in-browser product with
 * a short capability list and an animated cross-fade so users instantly grasp
 * the whole ecosystem. Pure CSS motion (no extra runtime dependency).
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

interface Panel {
  id: DashboardVariant;
  icon: string;
  label: { fa: string; en: string };
  title: { fa: string; en: string };
  description: { fa: string; en: string };
  features: { fa: string; en: string }[];
  accent: string;
}

const PANELS: Panel[] = [
  {
    id: "patient",
    icon: "HeartPulse",
    label: { fa: "پنل بیمار", en: "Patient Panel" },
    title: { fa: "سلامت شما، همیشه در دسترس", en: "Your health, always at hand" },
    description: {
      fa: "نوبت بگیرید، سوابق و نتایج آزمایش را ببینید، نسخهٔ الکترونیک دریافت کنید و درمان را از یک داشبورد دنبال کنید.",
      en: "Book visits, view records & lab results, receive e-prescriptions and track treatment from one dashboard.",
    },
    features: [
      { fa: "نوبت‌دهی آنلاین و یادآوری هوشمند", en: "Online booking & smart reminders" },
      { fa: "پروندهٔ پزشکی و تاریخچهٔ درمان", en: "Medical records & treatment history" },
      { fa: "نسخهٔ دیجیتال با کد QR داروخانه", en: "Digital Rx with pharmacy QR code" },
      { fa: "پرداخت آنلاین و کیف پول", en: "Online payment & wallet" },
    ],
    accent: "from-brand to-[var(--gradient-mid)]",
  },
  {
    id: "doctor",
    icon: "Stethoscope",
    label: { fa: "پنل پزشک", en: "Doctor Panel" },
    title: { fa: "مدیریت بیماران، یکپارچه", en: "Manage patients, effortlessly" },
    description: {
      fa: "صف ویزیت، پروندهٔ الکترونیک، صدور نسخه و درآمد — همه در یک پنل برای پزشکان.",
      en: "Patient queue, electronic records, prescribing and earnings — all in one doctor panel.",
    },
    features: [
      { fa: "صف ویزیت زنده و مدیریت نوبت", en: "Live visit queue & appointment control" },
      { fa: "پروندهٔ الکترونیک سلامت (EHR)", en: "Electronic health records (EHR)" },
      { fa: "نویسندهٔ نسخهٔ هوشمند دارو", en: "Smart medicine prescription composer" },
      { fa: "گزارش درآمد و آمار ویزیت", en: "Earnings & visit analytics" },
    ],
    accent: "from-sky-500 to-brand",
  },
  {
    id: "secretary",
    icon: "CalendarCheck2",
    label: { fa: "پنل پذیرش", en: "Secretary Panel" },
    title: { fa: "ادارهٔ کلینیک، بدون کاغذ", en: "Run the clinic, paperless" },
    description: {
      fa: "تقویم نوبت‌ها، پذیرش سریع بیمار، اتاق انتظار هوشمند و پیگیری درآمد برای پذیرش و منشی.",
      en: "Appointment calendar, fast patient intake, smart waiting room and revenue tracking for reception.",
    },
    features: [
      { fa: "تقویم مرکزی نوبت‌ها", en: "Central appointment calendar" },
      { fa: "ثبت سریع و پذیرش بیمار", en: "Quick register & patient intake" },
      { fa: "مدیریت زندهٔ اتاق انتظار", en: "Live waiting-room management" },
      { fa: "آمار درآمد و گزارش روزانه", en: "Daily revenue reports" },
    ],
    accent: "from-amber-400 to-[var(--gold)]",
  },
];

export function ProductShowcaseSection({ locale }: { locale: Locale }) {
  const [active, setActive] = useState<DashboardVariant>("patient");
  const activeIndex = PANELS.findIndex((p) => p.id === active);
  const panel = PANELS[activeIndex];

  return (
    <Section id="showcase" tone="mesh">
      <SectionHeading
        eyebrow={{ fa: "محصول را ببینید", en: "See the product" }}
        title={{ fa: "یک اکوسیستم، سه داشبورد قدرتمند", en: "One ecosystem, three powerful dashboards" }}
        description={{
          fa: "از بیمار تا پزشک و پذیرش؛ هر کس ابزار اختصاصی خود را در یک پلتفرم یکپارچه دارد.",
          en: "From patient to doctor to reception — everyone has their own tool in one unified platform.",
        }}
        locale={locale}
      />

      {/* Tabs */}
      <Reveal variant="fade" delay={0.1}>
        <div
          role="tablist"
          aria-label={locale === "en" ? "Product dashboards" : "داشبوردهای محصول"}
          className="relative mx-auto mt-10 grid w-full max-w-md grid-cols-3 items-center gap-1 rounded-2xl border border-border/70 bg-card p-1.5 shadow-soft"
        >
          {/* Sliding indicator */}
          <span
            aria-hidden="true"
            className={cn(
              "absolute inset-y-1.5 block w-[calc((100%-0.75rem)/3)] rounded-xl bg-gradient-to-br shadow-md transition-transform duration-300 ease-out",
              panel.accent,
            )}
            style={{ transform: `translateX(calc(${activeIndex} * (100% + 0.375rem)))`, insetInlineStart: "0.375rem" }}
          />
          {PANELS.map((p) => {
            const isActive = p.id === active;
            return (
              <button
                key={p.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(p.id)}
                className={cn(
                  "relative z-10 flex items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-medium transition-colors",
                  isActive ? "text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon name={p.icon} className="size-4" />
                <span className="hidden font-vazir sm:inline">
                  {locale === "en" ? p.label.en : p.label.fa}
                </span>
              </button>
            );
          })}
        </div>
      </Reveal>

      {/* Stage */}
      <div className="mt-10 grid items-center gap-10 lg:grid-cols-[0.92fr_1fr]">
        {/* Capabilities */}
        <div className="order-2 lg:order-1">
          <div key={panel.id} className="showcase-pop">
            <span className={cn("inline-flex items-center gap-2 rounded-full bg-gradient-to-br px-4 py-1.5 text-sm font-semibold text-white", panel.accent)}>
              <Icon name={panel.icon} className="size-4" />
              {locale === "en" ? panel.label.en : panel.label.fa}
            </span>
            <h3 className="mt-4 text-2xl font-bold tracking-tight text-foreground font-vazir sm:text-3xl">
              {locale === "en" ? panel.title.en : panel.title.fa}
            </h3>
            <p className="mt-3 max-w-lg text-base leading-8 text-muted-foreground font-vazir">
              {locale === "en" ? panel.description.en : panel.description.fa}
            </p>

            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {panel.features.map((f) => (
                <li key={f.fa} className="flex items-start gap-2.5">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                    <Icon name="Check" className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="text-sm leading-6 text-foreground/90 font-vazir">
                    {locale === "en" ? f.en : f.fa}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Mockup */}
        <div className="order-1 lg:order-2">
          <div className="relative">
            <div
              aria-hidden="true"
              className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-brand/15 via-[var(--gradient-mid)]/10 to-transparent blur-2xl"
            />
            <div key={panel.id} className="showcase-pop">
              <DashboardMockup variant={active} locale={locale} />
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
