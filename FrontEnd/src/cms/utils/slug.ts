/**
 * Slug helpers for article URLs. Persian titles are transliterated lightly via
 * a fallback id when Latin characters are absent.
 */

const PERSIAN_DIGIT_MAP: Record<string, string> = {
  "۰": "0",
  "۱": "1",
  "۲": "2",
  "۳": "3",
  "۴": "4",
  "۵": "5",
  "۶": "6",
  "۷": "7",
  "۸": "8",
  "۹": "9",
};

function normalizeDigits(input: string): string {
  return input.replace(/[۰-۹]/g, (d) => PERSIAN_DIGIT_MAP[d] ?? d);
}

/** Convert a title into a URL-safe slug (ASCII kebab-case when possible). */
export function slugify(title: string): string {
  const normalized = normalizeDigits(title.trim().toLowerCase());
  const ascii = normalized
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  if (ascii.length >= 2) return ascii;

  // Persian-only titles: stable hash-ish fallback so the editor always has a slug.
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash * 31 + title.charCodeAt(i)) >>> 0;
  }
  return `article-${hash.toString(36)}`;
}

/** Ensure uniqueness against an existing set of slugs. */
export function uniqueSlug(base: string, existing: Iterable<string>): string {
  const set = new Set(existing);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}
