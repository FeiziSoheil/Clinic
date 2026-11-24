import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * ارقام فارسی و لاتین مورد استفاده در تبدیل‌ها.
 */
const FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/**
 * تبدیل ارقام لاتین به معادل فارسی.
 */
export function toPersianDigits(input: string): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/**
 * تبدیل ارقام فارسی/عربی به معادل لاتین (ASCII). ارقام لاتین دست‌نخورده
 * باقی می‌مانند. برای نرمال‌سازی ورودی کاربر پیش از اعتبارسنجی/ارسال به
 * بک‌اند استفاده می‌شود (بک‌اند الگوی لاتین `09\d{9}` را انتظار دارد).
 */
export function toEnglishDigits(input: string): string {
  return String(input)
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/**
 * Format an integer fee as Toman currency, e.g. `200000` → `"۲۰۰٬۰۰۰ تومان"`.
 *
 * از `toLocaleString` برای جداکردن هزارگان (با جداکنندهٔ فارسی «٬») و نمایش
 * واحد پول به‌صورت متن فارسی «تومان» استفاده می‌کند.
 */
export function formatToman(amount: number): string {
  return `${toPersianDigits(amount.toLocaleString("fa-IR"))} تومان`;
}

/**
 * Format an ISO date (`"YYYY-MM-DD"`) into a friendly label.
 *
 * `style="short"` → `"Jun 15"` (month + day).
 * `style="day"`   → `"Mon 15"` (weekday short + day number).
 * Defaults to a full-ish `"Mon, Jun 15"`.
 *
 * Pure native `Intl` — no external date library required.
 */
export function formatDateLabel(
  dateStr: string,
  style: "short" | "day" | "full" = "full",
): string {
  // Parse as a local date (avoid timezone off-by-one from UTC midnight).
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);

  if (style === "short") {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (style === "day") {
    const weekday = date.toLocaleDateString("en-US", { weekday: "short" });
    return `${weekday} ${d}`;
  }
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/**
 * Compact currency formatter for large Toman amounts.
 *
 * مقیاس‌بندی به واحدهای خوانا تا محور نمودارها و کارت‌های آمادی خوانا بمانند:
 *  - >= ۱٬۰۰۰٬۰۰۰٬۰۰۰ → میلیارد با پسوند «میلیارد تومان»
 *  - >= ۱٬۰۰۰٬۰۰۰     → میلیون با پسوند «میلیون تومان»
 *  - در غیر این صورت   → اعداد جدا‌شده با «٬» (مثلاً `۱۲۰٬۰۰۰ تومان`)
 */
export function formatCurrency(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000_000) {
    return `${toPersianDigits((amount / 1_000_000_000).toFixed(1))} میلیارد تومان`;
  }
  if (abs >= 1_000_000) {
    return `${toPersianDigits((amount / 1_000_000).toFixed(0))} میلیون تومان`;
  }
  return `${toPersianDigits(amount.toLocaleString("fa-IR"))} تومان`;
}
