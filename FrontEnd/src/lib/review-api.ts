/**
 * Patient review API client.
 *
 * Real backend endpoints live under `/api/v1/...`. A {@link USE_MOCK} flag
 * keeps the previous fixture path available for offline UI work; default is
 * the live API.
 */

import { apiClient } from "./api";
import type {
  CreateReviewRequest,
  ModerateReviewRequest,
  PublicReviewsResponse,
  RatingSummary,
  ReplyReviewRequest,
  Review,
  ReviewRecord,
  ReviewStatus,
} from "@/types/review";
import { summarizeReviews, toUiReview } from "@/types/review";

/**
 * Master switch for the review mock layer. Keep `false` in normal operation
 * so public/doctor/admin/patient review calls hit the real API.
 */
export const USE_MOCK = false;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic mock reviews (approved-only public fixture). */
const MOCK_REVIEWS: Review[] = [
  {
    id: "rev-1",
    doctorId: "*",
    authorInitials: "م.ر",
    date: "2026-06-21",
    rating: 5,
    body: "برخورد بسیار حرفه‌ای و دقیق. وقت‌شناس بود و تمام سوال‌هایم را با حوصله پاسخ داد.",
    doctorReply: "از لطف شما سپاسگزارم. سلامتی شما آرزوی ماست.",
    helpfulCount: 14,
  },
  {
    id: "rev-2",
    doctorId: "*",
    authorInitials: "س.م",
    date: "2026-06-10",
    rating: 4,
    body: "تجربه خوبی داشتم، فقط مدت انتظار کمی طولانی بود. تشخیص دقیق و راهنمایی کامل.",
    helpfulCount: 6,
  },
  {
    id: "rev-3",
    doctorId: "*",
    authorInitials: "ا.ک",
    date: "2026-05-28",
    rating: 5,
    body: "بهترین تجربه ویزیت آنلاین. فرایند رزرو نوبت سریع و بدون دردسر بود.",
    helpfulCount: 22,
  },
];

/**
 * Fetch approved reviews for a doctor (public profile).
 *
 * Real endpoint: `GET /api/v1/doctors/:id/reviews` → `{ summary, reviews }`.
 * Returns the UI `Review[]` list; use {@link fetchDoctorReviewsWithSummary}
 * when the server summary is needed.
 */
export async function fetchDoctorReviews(doctorId: string): Promise<Review[]> {
  const packed = await fetchDoctorReviewsWithSummary(doctorId);
  return packed.reviews;
}

/** Fetch approved reviews + approved-only summary for a doctor. */
export async function fetchDoctorReviewsWithSummary(
  doctorId: string,
): Promise<{ reviews: Review[]; summary: RatingSummary }> {
  if (USE_MOCK) {
    await delay(300);
    const reviews = MOCK_REVIEWS.map((r) => ({
      ...r,
      id: `${r.id}-${doctorId}`,
      doctorId,
    }));
    return { reviews, summary: summarizeReviews(reviews) };
  }

  const res = await apiClient.get<PublicReviewsResponse>(
    `/v1/doctors/${doctorId}/reviews`,
  );
  const reviews = (res.data.reviews ?? []).map(toUiReview);
  return {
    reviews,
    summary: res.data.summary ?? summarizeReviews(reviews),
  };
}

/**
 * Patient: create a review for a completed appointment.
 *
 * Real endpoint: `POST /api/v1/reviews` → `201`.
 */
export async function createReview(
  req: CreateReviewRequest,
): Promise<ReviewRecord> {
  const res = await apiClient.post<ReviewRecord>("/v1/reviews", req);
  return res.data;
}

/**
 * Patient: list own reviews (any status).
 *
 * Real endpoint: `GET /api/v1/reviews/me`.
 */
export async function fetchMyReviews(): Promise<ReviewRecord[]> {
  const res = await apiClient.get<ReviewRecord[]>("/v1/reviews/me");
  return res.data ?? [];
}

/**
 * Doctor: list own reviews (pending + approved + rejected).
 *
 * Real endpoint: `GET /api/v1/doctor/reviews`.
 */
export async function fetchDoctorOwnReviews(): Promise<ReviewRecord[]> {
  const res = await apiClient.get<ReviewRecord[]>("/v1/doctor/reviews");
  return res.data ?? [];
}

/**
 * Doctor: reply to an approved review.
 *
 * Real endpoint: `POST /api/v1/doctor/reviews/:id/reply`.
 */
export async function replyToReview(
  id: string,
  req: ReplyReviewRequest,
): Promise<ReviewRecord> {
  const res = await apiClient.post<ReviewRecord>(
    `/v1/doctor/reviews/${id}/reply`,
    req,
  );
  return res.data;
}

/**
 * Admin: list reviews with optional status / doctor filters.
 *
 * Real endpoint: `GET /api/v1/admin/reviews?status=&doctor_id=`.
 */
export async function fetchAdminReviews(params?: {
  status?: ReviewStatus | "";
  doctorId?: string;
}): Promise<ReviewRecord[]> {
  const res = await apiClient.get<ReviewRecord[]>("/v1/admin/reviews", {
    params: {
      status: params?.status || undefined,
      doctor_id: params?.doctorId || undefined,
    },
  });
  return res.data ?? [];
}

/**
 * Admin: set review status (approve / reject / re-open pending).
 *
 * Real endpoint: `PATCH /api/v1/admin/reviews/:id/status`.
 */
export async function moderateReview(
  id: string,
  req: ModerateReviewRequest,
): Promise<ReviewRecord> {
  const res = await apiClient.patch<ReviewRecord>(
    `/v1/admin/reviews/${id}/status`,
    req,
  );
  return res.data;
}

// Re-export helpers previously living in this module so existing imports keep
// working (`@/lib/reviews`).
export type { Review, RatingSummary } from "@/types/review";
export { summarizeReviews } from "@/types/review";
