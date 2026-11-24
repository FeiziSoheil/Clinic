"use client";

/**
 * ============================================================================
 * CLINICK — DASHBOARD MOCKUP
 * ============================================================================
 * A realistic, premium "product" surface rendered entirely in HTML/CSS — no
 * images, so it loads instantly with zero CLS and scales crisply on every
 * display. Wrapped in a modern browser chrome and available in three variants
 * that mirror the real product: the Patient panel, the Doctor panel and the
 * Secretary panel.
 *
 * This is the single source of "show, don't tell" used by both the hero and the
 * product showcase. Keeping it data-free + localized lets the same component
 * power the first screen and the deeper product story.
 * ============================================================================
 */

import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/marketing/types";
import {
  CalendarCheck2,
  FileText,
  HeartPulse,
  LayoutGrid,
  Bell,
  Settings,
  Search,
  Clock,
  Users,
  CheckCircle2,
  Stethoscope,
  Wallet,
  TrendingUp,
  CalendarDays,
  Video,
  QrCode,
  Plus,
  Lock as LockIcon,
} from "lucide-react";

export type DashboardVariant = "patient" | "doctor" | "secretary";

interface DashboardMockupProps {
  variant: DashboardVariant;
  locale?: Locale;
  className?: string;
  /** Tighten paddings for tighter compositions (e.g. the hero). */
  compact?: boolean;
}

/* ── Browser chrome ───────────────────────────────────────────────────────── */

function BrowserFrame({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-[0_40px_90px_-40px_rgba(15,23,42,0.45)]">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border/70 bg-muted/60 px-4 py-2.5">
        <div className="flex items-center gap-1.5" aria-hidden="true">
          <span className="size-3 rounded-full bg-red-400/80" />
          <span className="size-3 rounded-full bg-amber-400/80" />
          <span className="size-3 rounded-full bg-emerald-400/80" />
        </div>
        <div className="mx-auto flex w-full max-w-xs items-center justify-center gap-1.5 rounded-md bg-background/80 px-3 py-1 text-[0.7rem] text-muted-foreground ring-1 ring-border/60">
          <LockIcon className="size-3 text-emerald-500" />
          <span dir="ltr" className="truncate font-vazir">
            {url}
          </span>
        </div>
      </div>
      {children}
    </div>
  );
}

/* ── Shared mini sidebar ──────────────────────────────────────────────────── */

function MiniSidebar({ active }: { active: string }) {
  const icons = [LayoutGrid, CalendarDays, FileText, HeartPulse, Wallet, Settings];
  return (
    <div className="hidden w-12 shrink-0 flex-col items-center gap-1.5 border-e border-border/60 bg-muted/30 py-3 sm:flex">
      <span className="mb-2 grid size-8 place-items-center rounded-lg bg-gradient-to-br from-brand to-[var(--gradient-mid)] text-white shadow-sm">
        <Plus className="size-4" strokeWidth={2.5} />
      </span>
      {icons.map((Icon, i) => {
        const label = ["home", "cal", "doc", "rec", "wallet", "set"][i];
        const isActive = label === active;
        return (
          <span
            key={label}
            className={cn(
              "grid size-8 place-items-center rounded-lg transition-colors",
              isActive
                ? "bg-brand/12 text-brand"
                : "text-muted-foreground/70",
            )}
          >
            <Icon className="size-4" />
          </span>
        );
      })}
    </div>
  );
}

/* ── Reusable bits ────────────────────────────────────────────────────────── */

function Avatar({
  initials,
  tone = "brand",
}: {
  initials: string;
  tone?: "brand" | "gold" | "info";
}) {
  const tones: Record<string, string> = {
    brand: "from-brand to-[var(--gradient-mid)]",
    gold: "from-amber-400 to-[var(--gold)]",
    info: "from-sky-500 to-brand",
  };
  return (
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-full bg-gradient-to-br text-[0.6rem] font-bold text-white",
        tones[tone],
      )}
    >
      {initials}
    </span>
  );
}

function Bar({ width, tone }: { width: string; tone: string }) {
  return (
    <span className="block h-1.5 w-full rounded-full bg-muted">
      <span
        className={cn("block h-full rounded-full", tone)}
        style={{ width }}
      />
    </span>
  );
}

/* ── Patient panel ────────────────────────────────────────────────────────── */

function PatientPanel({ locale, compact }: { locale: Locale; compact?: boolean }) {
  const fa = locale === "fa";
  return (
    <div className="flex min-h-[16rem]">
      <MiniSidebar active="home" />
      <div className="flex-1 space-y-3 p-4">
        {/* Greeting */}
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[0.7rem] text-muted-foreground">
              {fa ? "صبح بخیر 👋" : "Good morning 👋"}
            </p>
            <p className="text-sm font-bold text-foreground font-vazir">
              {fa ? "مریم حسینی" : "Maryam Hosseini"}
            </p>
          </div>
          <span className="relative grid size-8 place-items-center rounded-lg bg-muted text-muted-foreground">
            <Bell className="size-4" />
            <span className="absolute end-1.5 top-1.5 size-1.5 rounded-full bg-red-500" />
          </span>
        </div>

        {/* Next appointment — the hero card */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-brand to-[var(--gradient-mid)] p-3 text-white shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2 py-0.5 text-[0.62rem] font-medium">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-300" />
              {fa ? "نوبت تأیید شد" : "Confirmed"}
            </span>
            <Video className="size-3.5 opacity-90" />
          </div>
          <div className="mt-2 flex items-center gap-2.5">
            <Avatar initials="س.ر" tone="gold" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold font-vazir">
                {fa ? "دکتر سارا رضوی" : "Dr. Sara Razavi"}
              </p>
              <p className="text-[0.62rem] text-white/80">
                {fa ? "متخصص قلب · چهارشنبه ۱۰:۳۰" : "Cardiology · Wed 10:30"}
              </p>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: CalendarCheck2, label: fa ? "نوبت جدید" : "New appt." },
            { icon: FileText, label: fa ? "نسخه‌ها" : "Rx" },
            { icon: HeartPulse, label: fa ? "پرونده" : "Records" },
          ].map((q) => (
            <div
              key={q.label}
              className="flex flex-col items-center gap-1 rounded-lg border border-border/60 bg-background px-1 py-2 text-center"
            >
              <span className="grid size-7 place-items-center rounded-lg bg-brand/10 text-brand">
                <q.icon className="size-3.5" />
              </span>
              <span className="text-[0.58rem] text-muted-foreground">{q.label}</span>
            </div>
          ))}
        </div>

        {!compact ? (
          <div className="grid grid-cols-2 gap-2">
            {/* Medical timeline */}
            <div className="rounded-xl border border-border/60 bg-background p-2.5">
              <p className="mb-1.5 text-[0.62rem] font-semibold text-foreground">
                {fa ? "آخرین فعالیت‌ها" : "Recent activity"}
              </p>
              <div className="space-y-1.5">
                {[
                  { t: fa ? "نسخه الکترونیک" : "E-prescription", tone: "bg-emerald-500" },
                  { t: fa ? "نتیجه آزمایش" : "Lab result", tone: "bg-sky-500" },
                  { t: fa ? "ویزیت قلب" : "Cardio visit", tone: "bg-brand" },
                ].map((row) => (
                  <div key={row.t} className="flex items-center gap-1.5">
                    <span className={cn("size-1.5 rounded-full", row.tone)} />
                    <span className="text-[0.58rem] text-muted-foreground">{row.t}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Prescription QR */}
            <div className="flex flex-col items-center justify-center rounded-xl border border-border/60 bg-background p-2.5 text-center">
              <QrCode className="size-7 text-brand" />
              <p className="mt-1 text-[0.58rem] font-medium text-foreground">
                {fa ? "نسخه دیجیتال" : "Digital Rx"}
              </p>
              <p className="text-[0.55rem] text-muted-foreground">
                {fa ? "آماده تحویل داروخانه" : "Ready at pharmacy"}
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ── Doctor panel ─────────────────────────────────────────────────────────── */

function DoctorPanel({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  const queue = [
    { name: fa ? "علی رستگار" : "Ali R.", initials: "ع.ر", status: fa ? "در انتظار" : "Waiting", tone: "bg-amber-500/15 text-amber-600", time: "۱۰:۳۰" },
    { name: fa ? "زهرا کاظمی" : "Zahra K.", initials: "ز.ک", status: fa ? "در ویزیت" : "In visit", tone: "bg-brand/15 text-brand", time: "۱۰:۵۰" },
    { name: fa ? "محمد تقی" : "Mohammad", initials: "م.ت", status: fa ? "تکمیل شد" : "Done", tone: "bg-emerald-500/15 text-emerald-600", time: "۱۰:۱۰" },
  ];
  return (
    <div className="flex min-h-[16rem]">
      <MiniSidebar active="cal" />
      <div className="flex-1 space-y-3 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold text-foreground font-vazir">
              {fa ? "صف امروز" : "Today's queue"}
            </p>
            <p className="text-[0.62rem] text-muted-foreground">
              {fa ? "دکتر رضوی · قلب و عروق" : "Dr. Razavi · Cardiology"}
            </p>
          </div>
          <Search className="size-4 text-muted-foreground/60" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { icon: Users, v: fa ? "۱۲" : "12", l: fa ? "ویزیت" : "Visits" },
            { icon: Clock, v: fa ? "۳" : "3", l: fa ? "در انتظار" : "Waiting" },
            { icon: CheckCircle2, v: fa ? "۹" : "9", l: fa ? "تکمیل" : "Done" },
          ].map((s) => (
            <div key={s.l} className="rounded-lg border border-border/60 bg-background p-2">
              <s.icon className="size-3.5 text-brand" />
              <p className="mt-1 text-sm font-bold text-foreground">{s.v}</p>
              <p className="text-[0.55rem] text-muted-foreground">{s.l}</p>
            </div>
          ))}
        </div>

        {/* Queue */}
        <div className="space-y-1.5">
          {queue.map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-lg border border-border/60 bg-background px-2.5 py-2"
            >
              <Avatar initials={row.initials} tone={(["brand", "info", "gold"] as const)[i]} />
              <span className="flex-1 truncate text-[0.66rem] font-medium text-foreground font-vazir">
                {row.name}
              </span>
              <span className={cn("rounded-full px-2 py-0.5 text-[0.52rem] font-medium", row.tone)}>
                {row.status}
              </span>
              <span className="text-[0.58rem] tabular-nums text-muted-foreground">
                {row.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Secretary panel ──────────────────────────────────────────────────────── */

function SecretaryPanel({ locale }: { locale: Locale }) {
  const fa = locale === "fa";
  return (
    <div className="flex min-h-[16rem]">
      <MiniSidebar active="cal" />
      <div className="flex-1 space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold text-foreground font-vazir">
            {fa ? "تقویم نوبت‌ها" : "Appointment calendar"}
          </p>
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[0.55rem] font-medium text-brand">
            {fa ? "۱۸ نوبت امروز" : "18 today"}
          </span>
        </div>

        {/* Week strip */}
        <div className="grid grid-cols-7 gap-1">
          {(fa
            ? ["ش", "ی", "د", "س", "چ", "پ", "ج"]
            : ["S", "M", "T", "W", "T", "F", "S"]
          ).map((d, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col items-center rounded-lg border py-1.5 text-center",
                i === 2
                  ? "border-brand bg-brand text-white"
                  : "border-border/60 bg-background text-muted-foreground",
              )}
            >
              <span className="text-[0.5rem] opacity-70">{d}</span>
              <span className="text-[0.62rem] font-bold tabular-nums">
                {fa ? String(i + 3).split("").map((n) => "۰۱۲۳۴۵۶۷۸۹"[Number(n)]).join("") : i + 3}
              </span>
            </div>
          ))}
        </div>

        {/* Revenue + waiting */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-border/60 bg-background p-2.5">
            <div className="flex items-center gap-1.5 text-[0.6rem] text-muted-foreground">
              <TrendingUp className="size-3 text-emerald-500" />
              {fa ? "درآمد امروز" : "Today's revenue"}
            </div>
            <p className="mt-0.5 text-sm font-bold text-foreground font-vazir">
              {fa ? "۸٫۴ م تومان" : "8.4M T"}
            </p>
            <div className="mt-1.5">
              <Bar width="72%" tone="bg-gradient-to-r from-emerald-400 to-brand" />
            </div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background p-2.5">
            <div className="flex items-center gap-1.5 text-[0.6rem] text-muted-foreground">
              <Stethoscope className="size-3 text-brand" />
              {fa ? "اتاق انتظار" : "Waiting room"}
            </div>
            <p className="mt-0.5 text-sm font-bold text-foreground font-vazir">
              {fa ? "۵ بیمار" : "5 patients"}
            </p>
            <div className="mt-1.5">
              <Bar width="42%" tone="bg-gradient-to-r from-amber-400 to-[var(--gold)]" />
            </div>
          </div>
        </div>

        {/* Appointment rows */}
        <div className="space-y-1.5">
          {[
            { name: fa ? "نوبت قلب — دکتر رضوی" : "Cardio — Dr. Razavi", time: fa ? "۱۱:۰۰" : "11:00", tone: "bg-brand" },
            { name: fa ? "پیگیری — دکتر احمدی" : "Follow-up — Dr. Ahmadi", time: fa ? "۱۱:۳۰" : "11:30", tone: "bg-sky-500" },
          ].map((row, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background px-2.5 py-1.5">
              <span className={cn("size-2 rounded-full", row.tone)} />
              <span className="flex-1 truncate text-[0.62rem] text-foreground font-vazir">{row.name}</span>
              <span className="text-[0.55rem] tabular-nums text-muted-foreground">{row.time}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Public component ─────────────────────────────────────────────────────── */

const URLS: Record<DashboardVariant, string> = {
  patient: "app.clinick.ir/patient",
  doctor: "app.clinick.ir/doctor",
  secretary: "app.clinick.ir/secretary",
};

export function DashboardMockup({
  variant,
  locale = "fa",
  className,
  compact = false,
}: DashboardMockupProps) {
  return (
    <div className={className}>
      <BrowserFrame url={URLS[variant]}>
        {variant === "patient" && <PatientPanel locale={locale} compact={compact} />}
        {variant === "doctor" && <DoctorPanel locale={locale} />}
        {variant === "secretary" && <SecretaryPanel locale={locale} />}
      </BrowserFrame>
    </div>
  );
}
