import { pickLocalized } from "@/lib/marketing/locale";
import type { Doctor as DiscoveryDoctor } from "@/types/doctor";
import type { Doctor as MarketingDoctor, Locale } from "@/lib/marketing/types";
import type { DoctorCardModel } from "./types";

function discoveryAvailability(opts?: {
  firstAvailable?: string;
  onlineConsult?: boolean;
}): string | undefined {
  if (opts?.firstAvailable) {
    return `نزدیک‌ترین نوبت: ${opts.firstAvailable}`;
  }
  if (opts?.onlineConsult) return "مشاوره آنلاین";
  return undefined;
}

function marketingAvailability(
  doctor: MarketingDoctor,
  locale: Locale,
): string | undefined {
  if (doctor.availableToday) {
    return locale === "en" ? "Available today" : "امروز آزاد است";
  }
  if (doctor.nextSlot) {
    const slot = pickLocalized(doctor.nextSlot, locale);
    return locale === "en" ? `Next: ${slot}` : `نزدیک‌ترین: ${slot}`;
  }
  if (doctor.onlineConsult) {
    return locale === "en" ? "Online visit" : "ویزیت آنلاین";
  }
  return undefined;
}

export function mapDiscoveryDoctorToCard(
  doctor: DiscoveryDoctor,
  opts?: { firstAvailable?: string; onlineConsult?: boolean },
): DoctorCardModel {
  return {
    id: doctor.id,
    name: doctor.full_name,
    specialty: doctor.specialty,
    initials: `${doctor.first_name?.[0] ?? ""}${doctor.last_name?.[0] ?? ""}`,
    imageUrl: doctor.avatar_url,
    rating: doctor.rating,
    fee: doctor.visit_fee,
    availabilityLabel: discoveryAvailability(opts),
    profileHref: `/doctors/${doctor.id}?view=profile`,
    bookHref: `/doctors/${doctor.id}`,
  };
}

export function mapMarketingDoctorToCard(
  doctor: MarketingDoctor,
  locale: Locale,
): DoctorCardModel {
  return {
    id: doctor.id,
    name: pickLocalized(doctor.name, locale),
    specialty: pickLocalized(doctor.specialty, locale),
    imageUrl: doctor.imageUrl || undefined,
    rating: doctor.rating,
    reviewsCount: doctor.reviewsCount,
    fee: doctor.fee,
    availabilityLabel: marketingAvailability(doctor, locale),
    verified: doctor.verified,
    profileHref: doctor.profileHref,
    bookHref: doctor.bookHref,
  };
}
