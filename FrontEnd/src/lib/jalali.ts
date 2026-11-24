import { jalaaliMonthLength, toGregorian, toJalaali } from "jalaali-js";

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
];

/** Weekday short labels, Saturday-first (matches the Jalali week). */
export const JALALI_WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

/** Weekday full names, Saturday-first (matches the Jalali week). */
export const JALALI_WEEKDAYS_FULL = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];

/** Converts ASCII digits in a string to Persian digits. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)]);
}

/** Parses a Gregorian `"YYYY-MM-DD"` (or full ISO datetime) into `{ jy, jm, jd }`. */
export function isoToJalali(isoDate: string) {
  // Backend often returns Go `time.Time` as full ISO (`2026-07-10T00:00:00Z`);
  // take the calendar day only so split/Number stays valid.
  const dateOnly = isoDate.includes("T") ? isoDate.slice(0, 10) : isoDate;
  const [gy, gm, gd] = dateOnly.split("-").map(Number);
  return toJalaali(gy, gm, gd);
}

/** Converts a Jalali `(jy, jm, jd)` triple into a Gregorian `"YYYY-MM-DD"` string. */
export function jalaliToIso(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${String(gy).padStart(4, "0")}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

/** Formats a Gregorian `"YYYY-MM-DD"` string as a Persian label, e.g. `"۱۵ خرداد ۱۴۰۴"`. */
export function formatJalali(isoDate: string): string {
  if (!isoDate) return "";
  const { jy, jm, jd } = isoToJalali(isoDate);
  return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}`;
}

/** Today's date as a Gregorian `"YYYY-MM-DD"` string (local time). */
export function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Combine a Gregorian calendar day + Tehran wall-clock `"HH:mm"` into an ISO
 * 8601 timestamp the Go backend can parse into `time.Time`.
 *
 * Public slots are rendered in Asia/Tehran (see clinic-api `public.go`); booking
 * must send the same wall clock with the IRST offset (`+03:30`, no DST), not a
 * trailing `Z` (UTC) — otherwise the slot falls outside the doctor's shift and
 * the API returns 400.
 */
export function tehranWallClockToISO(date: string, time: string): string {
  const hhmm = time.length === 5 ? `${time}:00` : time;
  return `${date}T${hhmm}+03:30`;
}

/** Day-of-week for a Jalali `(jy, jm, jd)`, `0 = Saturday … 6 = Friday`. */
function jalaliWeekday(jy: number, jm: number, jd: number): number {
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  const gregorianDay = new Date(gy, gm - 1, gd).getDay(); // 0 = Sunday
  return (gregorianDay + 1) % 7; // shift so 0 = Saturday
}

/**
 * Format a Gregorian `"YYYY-MM-DD"` string as a Jalali label.
 *
 * `style="short"` → `"۱۵ خرداد"` (day + month).
 * `style="day"`   → `"چ ۱۵"` (weekday short + day number).
 * `style="full"`  → `"چ، ۱۵ خرداد"` (weekday short + day + month).
 * `style="long"`  → `"چهارشنبه ۱۵ خرداد ۱۴۰۴"` (full weekday + day + month + year).
 */
export function formatJalaliLabel(
  isoDate: string,
  style: "short" | "day" | "full" | "long" = "full",
): string {
  if (!isoDate) return "";
  const { jy, jm, jd } = isoToJalali(isoDate);
  const weekdayIndex = jalaliWeekday(jy, jm, jd);
  const day = toPersianDigits(jd);
  const month = JALALI_MONTHS[jm - 1];

  if (style === "short") return `${day} ${month}`;
  if (style === "day") return `${JALALI_WEEKDAYS[weekdayIndex]} ${day}`;
  if (style === "long") {
    return `${JALALI_WEEKDAYS_FULL[weekdayIndex]} ${day} ${month} ${toPersianDigits(jy)}`;
  }
  return `${JALALI_WEEKDAYS[weekdayIndex]}، ${day} ${month}`;
}

/**
 * Format a full ISO timestamp as a Jalali date + time label, e.g.
 * `"۱۵ خرداد ۱۴۰۴، ۱۴:۰۵"`.
 */
export function formatJalaliDateTime(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const isoDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const { jy, jm, jd } = isoToJalali(isoDate);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${toPersianDigits(jd)} ${JALALI_MONTHS[jm - 1]} ${toPersianDigits(jy)}، ${toPersianDigits(hh)}:${toPersianDigits(mm)}`;
}

export interface JalaliCalendarCell {
  jy: number;
  jm: number;
  jd: number;
  iso: string;
  inCurrentMonth: boolean;
}

/**
 * Builds a 6-row x 7-col grid of calendar cells for the given Jalali month,
 * padded with the trailing days of the previous month and leading days of
 * the next so every row is full.
 */
export function buildJalaliMonthGrid(
  jy: number,
  jm: number,
): JalaliCalendarCell[] {
  const firstWeekday = jalaliWeekday(jy, jm, 1);
  const monthLength = jalaaliMonthLength(jy, jm);

  const prevJm = jm === 1 ? 12 : jm - 1;
  const prevJy = jm === 1 ? jy - 1 : jy;
  const prevMonthLength = jalaaliMonthLength(prevJy, prevJm);

  const nextJm = jm === 12 ? 1 : jm + 1;
  const nextJy = jm === 12 ? jy + 1 : jy;

  const cells: JalaliCalendarCell[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const jd = prevMonthLength - i;
    cells.push({
      jy: prevJy,
      jm: prevJm,
      jd,
      iso: jalaliToIso(prevJy, prevJm, jd),
      inCurrentMonth: false,
    });
  }

  for (let jd = 1; jd <= monthLength; jd++) {
    cells.push({
      jy,
      jm,
      jd,
      iso: jalaliToIso(jy, jm, jd),
      inCurrentMonth: true,
    });
  }

  let nextJd = 1;
  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push({
      jy: nextJy,
      jm: nextJm,
      jd: nextJd,
      iso: jalaliToIso(nextJy, nextJm, nextJd),
      inCurrentMonth: false,
    });
    nextJd++;
    if (cells.length >= 42) break;
  }

  return cells;
}
