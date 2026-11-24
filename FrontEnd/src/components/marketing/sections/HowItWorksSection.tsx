"use client";

/**
 * ============================================================================
 * CLINICK — HOW IT WORKS (3 STEPS)
 * ============================================================================
 * The simplest possible path to value, distilled into three steps:
 *   1. Find Doctor  →  2. Choose Time  →  3. Visit or Consult Online
 * Each step has an icon, a short explanation and a tactile hover lift. A
 * gradient connector animates across the rail on desktop to imply flow.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { SectionHeading } from "@/components/marketing/ui/SectionHeading";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { Icon } from "@/components/marketing/ui/icon";
import { toPersianDigitsIfFa } from "@/components/marketing/ui/star-utils";
import type { Locale } from "@/lib/marketing/types";

interface Step {
  icon: string;
  title: { fa: string; en: string };
  description: { fa: string; en: string };
}

const STEPS: Step[] = [
  {
    icon: "UserSearch",
    title: { fa: "پزشک را پیدا کنید", en: "Find your doctor" },
    description: {
      fa: "بر اساس تخصص، شهر و امتیاز جستجو کنید و پروفایل پزشکان را مقایسه کنید.",
      en: "Search by specialty, city and rating, then compare doctor profiles.",
    },
  },
  {
    icon: "CalendarClock",
    title: { fa: "زمان را انتخاب کنید", en: "Choose a time" },
    description: {
      fa: "نوبت آزاد مناسب برنامهٔ خود را در چند ثانیه و به‌صورت آنلاین رزرو کنید.",
      en: "Book a free slot that suits your schedule in seconds — online.",
    },
  },
  {
    icon: "Video",
    title: { fa: "ویزیت یا مشاورهٔ آنلاین", en: "Visit or consult online" },
    description: {
      fa: "حضوری مراجعه کنید یا ویزیت آنلاین بگیرید؛ نسخه بلافاصله در دسترس شماست.",
      en: "Visit in person or online — your prescription is ready instantly.",
    },
  },
];

export function HowItWorksSection({ locale }: { locale: Locale }) {
  return (
    <Section id="how-it-works" tone="muted">
      <SectionHeading
        eyebrow={{ fa: "چگونه کار می‌کند", en: "How it works" }}
        title={{ fa: "در سه گام ساده شروع کنید", en: "Get started in three simple steps" }}
        description={{
          fa: "از پیدا کردن پزشک تا دریافت نسخه؛ مسیری شفاف و بدون پیچیدگی.",
          en: "From finding a doctor to getting your prescription — a clear, effortless path.",
        }}
        locale={locale}
      />

      <div className="relative mt-14">
        {/* Connector rail (desktop) */}
        <div
          aria-hidden="true"
          className="absolute top-9 hidden h-0.5 w-full overflow-hidden rounded-full bg-border lg:block"
        >
          <span className="howitworks-flow absolute inset-y-0 left-0 block w-1/3 bg-gradient-to-l from-transparent via-brand to-[var(--gradient-mid)]" />
        </div>

        <ol className="grid gap-8 sm:grid-cols-3 lg:gap-6">
          {STEPS.map((step, i) => (
            <Reveal
              as="li"
              key={step.icon}
              variant="fade-up"
              delay={i * 0.1}
              className="group relative flex flex-col items-center text-center lg:items-start lg:text-start"
            >
              <div className="relative z-10 mb-5 flex items-center justify-center">
                <span className="grid size-[4.5rem] place-items-center rounded-2xl border border-brand/20 bg-background text-brand shadow-soft transition-transform duration-500 group-hover:-translate-y-1.5 group-hover:shadow-glow">
                  <Icon name={step.icon} className="size-7 transition-transform duration-500 group-hover:scale-110" />
                </span>
                <span className="absolute -top-2 ltr:-right-2 rtl:-left-2 grid size-7 place-items-center rounded-full bg-gradient-to-br from-brand to-[var(--gradient-mid)] text-xs font-bold text-white shadow-md">
                  {toPersianDigitsIfFa(String(i + 1), locale)}
                </span>
              </div>
              <h3 className="text-lg font-bold text-foreground font-vazir">
                {locale === "en" ? step.title.en : step.title.fa}
              </h3>
              <p className="mt-2 max-w-xs text-sm leading-7 text-muted-foreground font-vazir">
                {locale === "en" ? step.description.en : step.description.fa}
              </p>
            </Reveal>
          ))}
        </ol>
      </div>
    </Section>
  );
}
