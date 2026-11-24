/**
 * React Query hooks for patient / doctor / admin review flows.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createReview,
  fetchAdminReviews,
  fetchDoctorOwnReviews,
  fetchDoctorReviewsWithSummary,
  fetchMyReviews,
  moderateReview,
  replyToReview,
} from "@/lib/review-api";
import type {
  CreateReviewRequest,
  ModerateReviewRequest,
  ReplyReviewRequest,
  ReviewStatus,
} from "@/types/review";

/** Root namespace + helpers for all review query keys. */
export const reviewKeys = {
  all: ["reviews"] as const,
  byDoctor: (doctorId: string) =>
    ["reviews", "doctor-public", doctorId] as const,
  mine: ["reviews", "mine"] as const,
  doctorOwn: ["reviews", "doctor-own"] as const,
  admin: (status?: string, doctorId?: string) =>
    ["reviews", "admin", status ?? "", doctorId ?? ""] as const,
};

/** Public approved reviews + summary for a doctor profile. */
export function useDoctorPublicReviews(doctorId: string) {
  return useQuery({
    queryKey: reviewKeys.byDoctor(doctorId),
    queryFn: () => fetchDoctorReviewsWithSummary(doctorId),
    enabled: !!doctorId,
  });
}

/** Patient: own reviews (any status). */
export function useMyReviews() {
  return useQuery({
    queryKey: reviewKeys.mine,
    queryFn: fetchMyReviews,
  });
}

/** Doctor: own reviews across statuses. */
export function useDoctorOwnReviews() {
  return useQuery({
    queryKey: reviewKeys.doctorOwn,
    queryFn: fetchDoctorOwnReviews,
  });
}

/** Admin: filterable review list. */
export function useAdminReviews(params?: {
  status?: ReviewStatus | "";
  doctorId?: string;
}) {
  return useQuery({
    queryKey: reviewKeys.admin(params?.status, params?.doctorId),
    queryFn: () =>
      fetchAdminReviews({
        status: params?.status,
        doctorId: params?.doctorId,
      }),
  });
}

/** Patient: submit a review after a completed visit. */
export function useCreateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: CreateReviewRequest) => createReview(req),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.mine });
      void qc.invalidateQueries({ queryKey: reviewKeys.all });
      toast.success("نظر شما ثبت شد و پس از تأیید نمایش داده می‌شود.");
    },
    onError: (err: Error) => {
      toast.error("ثبت نظر ناموفق بود.", { description: err.message });
    },
  });
}

/** Doctor: reply to an approved review. */
export function useReplyToReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reply }: { id: string; reply: string }) =>
      replyToReview(id, { reply } satisfies ReplyReviewRequest),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: reviewKeys.doctorOwn });
      void qc.invalidateQueries({ queryKey: reviewKeys.all });
      toast.success("پاسخ شما ثبت شد.");
    },
    onError: (err: Error) => {
      toast.error("ثبت پاسخ ناموفق بود.", { description: err.message });
    },
  });
}

/** Admin: approve / reject / hide a review. */
export function useModerateReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: ModerateReviewRequest["status"];
    }) => moderateReview(id, { status }),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: reviewKeys.all });
      const label =
        vars.status === "APPROVED"
          ? "نظر تأیید شد."
          : vars.status === "REJECTED"
            ? "نظر رد / پنهان شد."
            : "وضعیت نظر به‌روز شد.";
      toast.success(label);
    },
    onError: (err: Error) => {
      toast.error("تغییر وضعیت ناموفق بود.", { description: err.message });
    },
  });
}
