import axios from "axios";

/** User-facing text when cancel is blocked inside the 3-hour window (matches backend). */
export const CANCELLATION_TOO_LATE_MESSAGE =
  "لغو این نوبت امکان‌پذیر نیست؛ کمتر از ۳ ساعت به زمان ویزیت مانده است. طبق قوانین، لغو فقط تا ۳ ساعت قبل از نوبت مجاز است." as const;

const CANCELLATION_TOO_LATE_DEBUG_EN =
  "booking: cancellation is not allowed within 3 hours of the visit";

/** True when the API rejected cancel because the visit is within 3 hours. */
export function isCancellationTooLateError(err: unknown): boolean {
  if (!axios.isAxiosError(err) || err.response?.status !== 403) {
    return false;
  }

  const data = err.response.data as
    | { debug?: unknown; message?: string }
    | undefined;

  const debug = typeof data?.debug === "string" ? data.debug : "";
  if (
    debug.includes(CANCELLATION_TOO_LATE_DEBUG_EN) ||
    debug.includes(CANCELLATION_TOO_LATE_MESSAGE) ||
    debug.includes("کمتر از ۳ ساعت")
  ) {
    return true;
  }

  if (data?.message === CANCELLATION_TOO_LATE_MESSAGE) {
    return true;
  }

  return false;
}

/**
 * Toast/dialog description for a failed `POST /v1/bookings/cancel`.
 * Maps the known 3-hour rule; other errors keep the prior generic behavior.
 */
export function cancelAppointmentErrorDescription(
  err: unknown,
  fallback = "لطفاً دوباره تلاش کنید.",
): string {
  if (isCancellationTooLateError(err)) {
    return CANCELLATION_TOO_LATE_MESSAGE;
  }

  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { debug?: unknown; message?: string }
      | undefined;
    const debug = typeof data?.debug === "string" ? data.debug.trim() : "";
    if (debug && !debug.startsWith("booking:")) {
      return debug;
    }
    if (
      typeof data?.message === "string" &&
      data.message.trim() &&
      data.message !== "forbidden"
    ) {
      return data.message;
    }
  }

  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }

  return fallback;
}