import type { Metadata } from "next";
import { BookingReview } from "@/components/booking/BookingReview";

export const metadata: Metadata = {
  title: "تکمیل رزرو نوبت | کلینیک",
  description: "مرور خلاصهٔ نوبت، انتخاب تاریخ و ساعت و پرداخت آنلاین.",
  alternates: { canonical: "/booking" },
  robots: { index: false, follow: true },
};

/**
 * Booking review & payment entry. Entirely client-driven because the booking
 * selection lives in the persisted `BookingDraft` (localStorage) — this server
 * shell just provides metadata + the scroll container, and {@link BookingReview}
 * restores the draft (resuming after OTP) and commits the appointment.
 */
export default function BookingPage() {
  return (
    <div className="booking-container py-10 sm:py-14">
      <BookingReview />
    </div>
  );
}
