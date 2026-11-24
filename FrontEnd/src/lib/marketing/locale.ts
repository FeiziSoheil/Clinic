import type { Locale, LocalizedText } from "./types";

/**
 * Resolve a {@link LocalizedText} to a plain string for the active locale.
 *
 * Farsi is always present (the clinic's primary language); English is optional.
 * We fall back to Farsi, then English, then an empty string so a missing
 * translation never crashes the UI — it simply shows the Farsi copy.
 *
 * @example
 * pickLocalized(settings.clinicName, "fa"); // "کلینیک سپاس"
 * pickLocalized(settings.clinicName, "en"); // "Sepas Clinic"
 */
export function pickLocalized(
  text: LocalizedText | undefined,
  locale: Locale = "fa",
): string {
  if (!text) return "";
  if (locale === "en" && text.en) return text.en;
  return text.fa ?? text.en ?? "";
}

/** Map a locale to its document direction. */
export function getDir(locale: Locale): "rtl" | "ltr" {
  return locale === "en" ? "ltr" : "rtl";
}

/** The HTML `lang` attribute value for a locale. */
export function getLang(locale: Locale): string {
  return locale === "en" ? "en" : "fa";
}

/** Resolve a list of localized strings to the active locale. */
export function localizeList(list: LocalizedText[] | undefined, locale: Locale = "fa"): string[] {
  if (!list) return [];
  return list.map((item) => pickLocalized(item, locale));
}
