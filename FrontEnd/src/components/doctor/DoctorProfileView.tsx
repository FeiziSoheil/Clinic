"use client";

/**
 * ============================================================================
 * CLINICK — DOCTOR PROFILE VIEW (spec §6)
 * ============================================================================
 * The interactive doctor profile (progressive enhancement of the SEO page).
 * Base-UI tabs: درباره / برنامه نوبت‌ها / نظرات. The primary CTA captures
 * the doctor into the booking draft (`patchDraft({ doctorId, step })`) and
 * routes to the booking flow — so the patient never loses progress into OTP.
 * ============================================================================
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Clock,
  BadgeCheck,
  CalendarClock,
  Wallet,
  ArrowLeft,
} from "lucide-react";

import type { Doctor } from "@/types/doctor";
import { cn, toPersianDigits } from "@/lib/utils";
import { useBookingSession } from "@/hooks/useBookingSession";
import { useDoctorShifts } from "@/hooks/useDoctors";
import { StarRating } from "@/components/marketing/ui/StarRating";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReviewsSection } from "./ReviewsSection";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

function formatShiftDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("fa-IR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    }).format(new Date(iso));
  } catch {
    return toPersianDigits(iso);
  }
}

export function DoctorProfileView({ doctor }: { doctor: Doctor }) {
  const router = useRouter();
  const { patchDraft } = useBookingSession();
  const { data: shifts, isLoading: shiftsLoading } = useDoctorShifts(doctor.id);

  /** Start the booking journey for this doctor (writes the draft, no auth yet). */
  const startBooking = () => {
    patchDraft({ doctorId: doctor.id, step: "datetime" });
    router.push("/booking");
  };

  const initials = `${doctor.first_name?.[0] ?? ""}${doctor.last_name?.[0] ?? ""}`;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div
          className="flex size-24 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-brand-mint text-2xl font-bold text-brand ring-1 ring-border"
          aria-hidden="true"
        >
          {doctor.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={doctor.avatar_url} alt="" className="size-full object-cover" />
          ) : (
            toPersianDigits(initials || "؟")
          )}
        </div>

        <div className="flex-1">
          <h1 className="text-display-lg font-bold tracking-tight">
            {doctor.full_name}
          </h1>
          <p className="mt-1 flex items-center gap-1.5 text-body-lg text-muted-foreground">
            <Stethoscope className="size-4" aria-hidden="true" />
            {doctor.specialty}
          </p>
          {typeof doctor.rating === "number" ? (
            <div className="mt-2">
              <StarRating value={doctor.rating} size={16} />
            </div>
          ) : null}
          <p className="mt-1 flex items-center gap-1.5 text-meta text-muted-foreground">
            <BadgeCheck className="size-3.5 text-brand" aria-hidden="true" />
            نظام پزشک: {toPersianDigits(doctor.medical_system_number)}
          </p>
        </div>

        <aside className="flex w-full flex-col overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10 sm:w-64">
          <div
            className="pointer-events-none absolute -left-8 -top-8 size-24 rounded-full bg-brand/10 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
            aria-hidden="true"
          />
          <div className="relative flex flex-col gap-3 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 text-meta font-medium text-muted-foreground">
                <span className="grid size-6 place-items-center rounded-lg bg-brand/10 text-brand ring-1 ring-brand/15">
                  <Wallet className="size-3.5" aria-hidden="true" />
                </span>
                حق ویزیت
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border/80">
                <Clock className="size-3" aria-hidden="true" />
                {toPersianDigits(doctor.visit_duration_minutes.toString())} دقیقه
              </span>
            </div>

            <p className="flex items-baseline gap-1.5 tabular-nums">
              <span className="text-xl font-bold tracking-tight text-foreground">
                {toPersianDigits(doctor.visit_fee.toLocaleString("fa-IR"))}
              </span>
              <span className="text-xs font-medium text-muted-foreground">تومان</span>
            </p>

            <button
              type="button"
              onClick={startBooking}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-brand-foreground shadow-soft transition-all hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:translate-y-px"
            >
              نوبت‌دهی
              <ArrowLeft className="size-4 opacity-80" aria-hidden="true" />
            </button>

            <Link
              href="#reviews"
              className="text-center text-xs font-medium text-brand-cyan transition-colors hover:text-brand hover:underline"
            >
              خواندن نظرات بیماران
            </Link>
          </div>
        </aside>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="about">
        <TabsList className="w-full justify-stretch">
          <TabsTrigger value="about">درباره پزشک</TabsTrigger>
          <TabsTrigger value="schedule">برنامه نوبت‌ها</TabsTrigger>
          <TabsTrigger value="reviews">نظرات</TabsTrigger>
        </TabsList>

        {/* About */}
        <TabsContent value="about">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">درباره پزشک</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-body leading-relaxed text-muted-foreground">
                {doctor.bio ?? "اطلاعات بیوگرافی این پزشک به‌زودی تکمیل می‌شود."}
              </p>
              <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="text-meta text-muted-foreground">شماره نظام پزشک</dt>
                  <dd className="font-medium tabular-nums">
                    {toPersianDigits(doctor.medical_system_number)}
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-meta text-muted-foreground">تخصص</dt>
                  <dd className="font-medium">{doctor.specialty}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Schedule (summary; full calendar lands in Phase 4) */}
        <TabsContent value="schedule">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">شیفت‌های پیش‌رو</CardTitle>
                <CalendarClock className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
            </CardHeader>
            <CardContent>
              {shiftsLoading ? (
                <p className="text-sm text-muted-foreground">در حال بارگذاری برنامه…</p>
              ) : shifts && shifts.length > 0 ? (
                <ul className="flex flex-col divide-y divide-border">
                  {shifts.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{formatShiftDate(s.date)}</span>
                    <span className="flex items-center gap-1 text-muted-foreground tabular-nums">
                      <Clock className="size-3.5" aria-hidden="true" />
                      {toPersianDigits(s.start_time)} – {toPersianDigits(s.end_time)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">
                شیفت فعالی یافت نشد.
              </p>
            )}
            <button
              type="button"
              onClick={startBooking}
              className={cn(
                "mt-6 h-11 w-full rounded-xl bg-brand px-6 font-semibold text-brand-foreground",
                "transition-all hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand",
              )}
            >
              انتخاب تاریخ و رزرو نوبت
            </button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Reviews */}
        <TabsContent value="reviews" id="reviews">
          <ReviewsSection doctorId={doctor.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
