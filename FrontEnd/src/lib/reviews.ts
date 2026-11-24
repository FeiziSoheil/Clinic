/**
 * ============================================================================
 * CLINICK — PATIENT REVIEWS DATA LAYER (spec §7)
 * ============================================================================
 * Compatibility re-export. Prefer `@/lib/review-api` + `@/types/review` for new
 * code. Public fetch still uses {@link USE_MOCK} (default: live API).
 * ============================================================================
 */

export {
  USE_MOCK,
  fetchDoctorReviews,
  fetchDoctorReviewsWithSummary,
  createReview,
  fetchMyReviews,
  fetchDoctorOwnReviews,
  replyToReview,
  fetchAdminReviews,
  moderateReview,
  summarizeReviews,
} from "@/lib/review-api";

export type { Review, RatingSummary } from "@/types/review";
