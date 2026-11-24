/**
 * Patient review domain types (moderation statuses + API DTOs).
 *
 * Status model mirrors the backend:
 *   PENDING  — awaiting admin moderation (not public)
 *   APPROVED — public; doctor may reply
 *   REJECTED — hidden from public (admin can reject after approval to hide)
 */

/** Moderation lifecycle of a patient review. */
export type ReviewStatus = "PENDING" | "APPROVED" | "REJECTED";

/** Public review card shown on doctor profiles (approved only). */
export interface PublicReview {
  id: string;
  doctor_id: string;
  author_initials: string;
  /** ISO date `"YYYY-MM-DD"`. */
  date: string;
  rating: number;
  body: string;
  doctor_reply?: string;
  helpful_count: number;
}

/** Full review DTO for authenticated panels (patient / doctor / admin). */
export interface ReviewRecord {
  id: string;
  appointment_id: string;
  patient_id: string;
  doctor_id: string;
  doctor_profile_id?: string;
  rating: number;
  body: string;
  status: ReviewStatus;
  author_initials: string;
  doctor_reply?: string;
  replied_at?: string;
  helpful_count: number;
  created_at: string;
  updated_at: string;
}

/** Aggregate rating summary derived from APPROVED reviews only. */
export interface RatingSummary {
  average: number;
  total: number;
  /** Counts per star bucket, index 0 = 1★ … 4 = 5★. */
  distribution: [number, number, number, number, number];
}

/** Public list response: approved reviews + summary. */
export interface PublicReviewsResponse {
  summary: RatingSummary;
  reviews: PublicReview[];
}

/** Patient create payload. */
export interface CreateReviewRequest {
  appointment_id: string;
  rating: number;
  body: string;
}

/** Doctor reply payload. */
export interface ReplyReviewRequest {
  reply: string;
}

/** Admin moderation payload. */
export interface ModerateReviewRequest {
  status: ReviewStatus;
}

/**
 * Legacy display shape used by `ReviewCard` / `ReviewsSection`.
 * Maps from {@link PublicReview}.
 */
export interface Review {
  id: string;
  doctorId: string;
  authorInitials: string;
  date: string;
  rating: number;
  body: string;
  doctorReply?: string;
  helpfulCount: number;
}

/** Map a public API review into the UI `Review` contract. */
export function toUiReview(r: PublicReview): Review {
  return {
    id: r.id,
    doctorId: r.doctor_id,
    authorInitials: r.author_initials,
    date: r.date,
    rating: r.rating,
    body: r.body,
    doctorReply: r.doctor_reply,
    helpfulCount: r.helpful_count,
  };
}

/** Derive average + per-star distribution from a list of UI reviews. */
export function summarizeReviews(reviews: Review[]): RatingSummary {
  const total = reviews.length;
  const distribution: RatingSummary["distribution"] = [0, 0, 0, 0, 0];
  let sum = 0;
  for (const r of reviews) {
    sum += r.rating;
    const idx = Math.min(4, Math.max(0, Math.round(r.rating) - 1));
    distribution[idx] += 1;
  }
  return {
    average: total ? Math.round((sum / total) * 10) / 10 : 0,
    total,
    distribution,
  };
}
