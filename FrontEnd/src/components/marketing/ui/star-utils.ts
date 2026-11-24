/** Shared tiny helpers for the star rating (kept separate for testability). */

const PERSIAN = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];

/** Convert ASCII digits to Persian numerals when the locale is Farsi. */
export function toPersianDigitsIfFa(input: string, locale: "fa" | "en"): string {
  if (locale !== "fa") return input;
  return input.replace(/\d/g, (d) => PERSIAN[Number(d)] ?? d);
}
