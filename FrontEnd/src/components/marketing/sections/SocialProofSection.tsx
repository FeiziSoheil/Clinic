/**
 * ============================================================================
 * CLINICK — SOCIAL PROOF
 * ============================================================================
 * A focused, high-impact band of platform-scale metrics (appointments, doctors,
 * clinics, prescriptions) anchored by an explicit rating + patient avatar stack.
 * The numbers animate into view to reinforce credibility and momentum.
 * ============================================================================
 */

import { Section } from "@/components/marketing/ui/Section";
import { Reveal } from "@/components/marketing/motion/Reveal";
import { AnimatedCounter } from "@/components/marketing/motion/AnimatedCounter";
import { Icon } from "@/components/marketing/ui/icon";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/marketing/types";

interface Metric {
  icon: string;
  value: number;
  prefix?: string;
  suffix: string;
  label: { fa: string; en: string };
}

const METRICS: Metric[] = [
  { icon: "CalendarCheck2", value: 120, suffix: "K+", label: { fa: "نوبت موفق", en: "Appointments" } },
  { icon: "Stethoscope", value: 350, suffix: "+", label: { fa: "پزشک متخصص", en: "Specialist doctors" } },
  { icon: "Building2", value: 85, suffix: "+", label: { fa: "کلینیک همکار", en: "Partner clinics" } },
  { icon: "FileText", value: 50, suffix: "K+", label: { fa: "نسخهٔ الکترونیک", en: "E-prescriptions" } },
];

const AVATAR_TONES = [
  "from-brand to-[var(--gradient-mid)]",
  "from-amber-400 to-[var(--gold)]",
  "from-sky-500 to-brand",
  "from-emerald-500 to-brand",
  "from-violet-500 to-brand",
];

export function SocialProofSection({ locale }: { locale: Locale }) {
  return (
    <Section id="social-proof" tone="muted">
      <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr]">
        {/* Rating emphasis */}
        <Reveal variant="fade-up">
          <div className="rounded-3xl border border-border/70 bg-card p-7 shadow-soft">
            <div className="flex items-center gap-4">
              <div className="flex flex-col items-center">
                <span className="text-5xl font-extrabold tracking-tight text-foreground font-vazir">
                  <AnimatedCounter value={4.9} decimals={1} locale={locale} />
                </span>
                <span className="mt-1 flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 text-amber-400" fill="currentColor" />
                  ))}
                </span>
              </div>
              <div className="h-14 w-px bg-border" />
              <p className="text-sm leading-7 text-muted-foreground font-vazir">
                {locale === "en"
                  ? "Average rating from 12,000+ verified patients who booked through Clinick."
                  : "میانگین امتیاز بیش از ۱۲٬۰۰۰ بیمار تأییدشده که نوبت خود را از کلینیک گرفتند."}
              </p>
            </div>

            {/* Avatar stack */}
            <div className="mt-6 flex items-center gap-3 border-t border-border/60 pt-5">
              <div className="flex -space-x-2.5 rtl:space-x-reverse">
                {AVATAR_TONES.map((tone, i) => (
                  <span
                    key={i}
                    className={cn(
                      "grid size-9 place-items-center rounded-full bg-gradient-to-br text-[0.65rem] font-bold text-white ring-2 ring-card",
                      tone,
                    )}
                  >
                    {["م", "ع", "ز", "ر", "س"][i]}
                  </span>
                ))}
                <span className="grid size-9 place-items-center rounded-full bg-muted text-[0.6rem] font-bold text-muted-foreground ring-2 ring-card font-vazir">
                  +۹۹
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-vazir">
                {locale === "en" ? "Patients trust Clinick" : "بیماران به کلینیک اعتماد می‌کنند"}
              </span>
            </div>
          </div>
        </Reveal>

        {/* Metrics grid */}
        <Reveal variant="fade-up" stagger={0.08}>
          <div className="grid grid-cols-2 gap-4">
            {METRICS.map((m) => (
              <div
                key={m.label.fa}
                className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-6 shadow-soft transition-all duration-500 hover:-translate-y-1 hover:border-brand/40 hover:shadow-card"
              >
                <span className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-brand/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100" aria-hidden="true" />
                <span className="grid size-11 place-items-center rounded-2xl bg-brand/10 text-brand ring-1 ring-brand/10">
                  <Icon name={m.icon} className="size-5" />
                </span>
                <p className="mt-3 text-3xl font-extrabold tracking-tight text-foreground font-vazir">
                  <AnimatedCounter
                    value={m.value}
                    prefix={m.prefix}
                    suffix={locale === "en" ? m.suffix : m.suffix.replace("K+", "هزار+").replace("+", "+")}
                    locale={locale}
                  />
                </p>
                <p className="mt-1 text-sm text-muted-foreground font-vazir">
                  {locale === "en" ? m.label.en : m.label.fa}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
