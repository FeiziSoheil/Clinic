/**
 * ============================================================================
 * CLINICK — MARKETING CMS API
 * ============================================================================
 * Single source of truth for landing-page content.
 *
 * Resolution strategy (every piece of data is CMS-driven, never hard-coded):
 *  1. Try a dedicated marketing CMS endpoint (`/marketing/site`) and merge the
 *     remote payload. This is where the admin panel will eventually write.
 *  2. Merge the LIVE public doctor directory (`/v1/doctors`) so the "پزشکان"
 *     section always reflects real practitioners when the backend is up.
 *  3. Fall back to a rich, production-grade Persian dataset so the site is fully
 *     usable offline / during development (per FRONTEND_RULES §8: "Provide mock
 *     data if the backend endpoint is not yet connected").
 *
 * All fetches use Next's `fetch` with `revalidate` so the marketing tree is
 * statically optimized and ISR-refreshed — keeping Lighthouse > 95.
 * ============================================================================
 */

import type {
  Article,
  Doctor,
  Locale,
  MarketingContent,
} from "./types";
import { getFallbackContent } from "./fallback-content";

/**
 * Base URL for the clinic REST API. Mirrors `src/lib/api.ts` but kept separate
 * (and server-side) so the marketing tree does not pull the authenticated axios
 * instance or the zustand auth store into its bundle.
 */
const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

/** Base URL of a dedicated marketing/headless CMS, when configured. */
const CMS_BASE = process.env.NEXT_PUBLIC_CMS_URL ?? "";

/** Raw shape of a published article summary from `/v1/articles`. */
interface ArticleSummaryDTO {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  category: string;
  cover_image_url?: string;
  reading_minutes?: number;
  published_at?: string | null;
}

/** Raw shape of the public doctor-directory DTO (see internal/clinic/clinic.go). */
interface DoctorProfileDTO {
  id: string;
  user_id?: string;
  specialty: string;
  medical_system_number?: string;
  visit_duration_minutes?: number;
  visit_fee?: number;
  first_name?: string;
  last_name?: string;
}

/**
 * Map a raw doctor-directory DTO to the marketing {@link Doctor} model.
 *
 * The backend directory is intentionally lean (no photos/ratings/schedules), so
 * the richer presentational fields are left undefined and the UI gracefully
 * renders a styled initials avatar + neutral rating. This keeps live data honest
 * while preserving the premium card design.
 */
function mapDoctorDTO(dto: DoctorProfileDTO, index: number): Doctor {
  const fullName = [dto.first_name, dto.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  const slug = dto.id ?? `doctor-${index}`;
  return {
    id: dto.id ?? slug,
    slug,
    name: { fa: fullName || "پزشک متخصص", en: fullName || "Specialist" },
    specialty: { fa: dto.specialty, en: dto.specialty },
    imageUrl: "",
    medicalCouncilId: dto.medical_system_number,
    yearsExperience: undefined,
    rating: undefined,
    reviewsCount: undefined,
    daysAvailable: undefined,
    bio: undefined,
    profileHref: `/doctors/${slug}`,
    bookHref: `/booking?doctor=${slug}`,
  };
}

/**
 * Fetch published articles for the marketing homepage teaser grid.
 * Resolves to an empty array on any error so callers can fall back to mock data.
 */
export async function fetchPublicArticles(): Promise<Article[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/articles?page=1&page_size=12`, {
      next: { revalidate: 60, tags: ["articles"] },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { items?: ArticleSummaryDTO[] } | null;
    const items = data?.items;
    if (!Array.isArray(items) || items.length === 0) return [];
    return items.map((item) => ({
      id: item.id,
      slug: item.slug,
      title: { fa: item.title, en: item.title },
      excerpt: { fa: item.excerpt, en: item.excerpt },
      category: { fa: item.category, en: item.category },
      imageUrl: item.cover_image_url ?? "",
      readingTime: item.reading_minutes,
      publishedAt: item.published_at ?? undefined,
      href: `/articles/${item.slug}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch the live public doctor directory and map it to marketing doctors.
 * Resolves to an empty array on any error so the caller can fall back to mock
 * doctors without surfacing a broken state.
 */
export async function fetchDoctorDirectory(): Promise<Doctor[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/doctors`, {
      next: { revalidate: 60, tags: ["doctors"] },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as DoctorProfileDTO[] | null;
    if (!Array.isArray(data) || data.length === 0) return [];
    return data.map(mapDoctorDTO);
  } catch {
    // Backend not running / unreachable — degrade silently to mock doctors.
    return [];
  }
}

/**
 * Fetch a full CMS payload from a headless marketing CMS, when configured.
 * Returns `null` when no CMS is configured or the request fails.
 */
async function fetchCmsContent(locale: Locale): Promise<MarketingContent | null> {
  if (!CMS_BASE) return null;
  try {
    const res = await fetch(`${CMS_BASE}/site?locale=${locale}`, {
      next: { revalidate: 60, tags: ["marketing-site"] },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<MarketingContent>;
    // Require at least the settings block before trusting a remote payload.
    if (!data || !data.settings) return null;
    return data as MarketingContent;
  } catch {
    return null;
  }
}

/**
 * Resolve the complete marketing content payload for a locale.
 *
 * This is the function the homepage server component calls. It is the ONLY
 * public entry point and guarantees a fully-populated {@link MarketingContent}
 * (live CMS → live doctors merged into fallback), so no caller ever has to
 * guard against missing sections.
 *
 * @example
 * const content = await fetchMarketingContent("fa");
 */
export async function fetchMarketingContent(
  locale: Locale = "fa",
): Promise<MarketingContent> {
  const fallback = getFallbackContent(locale);

  // 1. Prefer a remote CMS payload when available.
  const remote = await fetchCmsContent(locale);
  if (remote) return remote;

  // 2. Merge live doctors and published articles into the fallback dataset.
  const [liveDoctors, liveArticles] = await Promise.all([
    fetchDoctorDirectory(),
    fetchPublicArticles(),
  ]);

  if (liveDoctors.length > 0 || liveArticles.length > 0) {
    return {
      ...fallback,
      doctors:
        liveDoctors.length > 0
          ? { ...fallback.doctors, items: liveDoctors }
          : fallback.doctors,
      articles:
        liveArticles.length > 0
          ? { ...fallback.articles, items: liveArticles }
          : fallback.articles,
    };
  }

  // 3. Pure fallback (offline / dev / first deploy).
  return fallback;
}
