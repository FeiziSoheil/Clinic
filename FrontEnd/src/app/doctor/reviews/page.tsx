"use client";

/**
 * Doctor reviews inbox.
 *
 * Shows pending + approved + rejected reviews for the signed-in doctor.
 * Reply composer is enabled only for APPROVED reviews (product rule).
 */

import { useMemo, useState } from "react";
import { Loader2, MessageSquareText, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  PanelPageHeader,
} from "@/components/shared/panel/PanelKit";
import {
  useDoctorOwnReviews,
  useReplyToReview,
} from "@/hooks/useReviews";
import { formatJalaliLabel } from "@/lib/jalali";
import { toPersianDigits } from "@/lib/utils";
import type { ReviewRecord, ReviewStatus } from "@/types/review";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "در انتظار تأیید",
  APPROVED: "تأییدشده",
  REJECTED: "رد شده",
};

function statusVariant(status: ReviewStatus) {
  switch (status) {
    case "PENDING":
      return "secondary" as const;
    case "APPROVED":
      return "default" as const;
    case "REJECTED":
      return "destructive" as const;
  }
}

export default function DoctorReviewsPage() {
  const { data, isLoading, isError } = useDoctorOwnReviews();
  const replyMutation = useReplyToReview();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const list = data ?? [];
  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, rejected: 0, unreplied: 0 };
    for (const r of list) {
      if (r.status === "PENDING") c.pending += 1;
      if (r.status === "APPROVED") {
        c.approved += 1;
        if (!r.doctor_reply) c.unreplied += 1;
      }
      if (r.status === "REJECTED") c.rejected += 1;
    }
    return c;
  }, [list]);

  async function submitReply(r: ReviewRecord) {
    const reply = (drafts[r.id] ?? "").trim();
    if (!reply) return;
    await replyMutation.mutateAsync({ id: r.id, reply });
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[r.id];
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <PanelPageHeader
        title="نظرات بیماران"
        subtitle="نظرات در انتظار تأیید ادمین هستند. پاسخ عمومی فقط پس از تأیید امکان‌پذیر است."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground">در انتظار</p>
            <p className="text-2xl font-semibold tabular-nums">
              {toPersianDigits(String(counts.pending))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground">تأییدشده</p>
            <p className="text-2xl font-semibold tabular-nums">
              {toPersianDigits(String(counts.approved))}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="text-muted-foreground">بدون پاسخ</p>
            <p className="text-2xl font-semibold tabular-nums">
              {toPersianDigits(String(counts.unreplied))}
            </p>
          </CardContent>
        </Card>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          در حال بارگذاری نظرات…
        </div>
      )}

      {isError && (
        <p className="py-10 text-center text-sm text-destructive">
          بارگذاری نظرات ناموفق بود.
        </p>
      )}

      {!isLoading && !isError && list.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12">
            <MessageSquareText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">هنوز نظری ثبت نشده است.</p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {list.map((r) => (
          <Card key={r.id}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-bold">
                    {r.author_initials}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{r.author_initials}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatJalaliLabel(r.created_at.slice(0, 10), "full")} ·{" "}
                      {toPersianDigits(String(r.rating))} از ۵
                    </p>
                  </div>
                </div>
                <Badge variant={statusVariant(r.status)}>
                  {STATUS_LABEL[r.status]}
                </Badge>
              </div>

              <p className="text-sm leading-relaxed">{r.body}</p>

              {r.doctor_reply ? (
                <div className="rounded-xl bg-muted/60 p-3 text-sm">
                  <p className="mb-1 font-semibold text-brand">پاسخ شما</p>
                  <p className="text-muted-foreground">{r.doctor_reply}</p>
                </div>
              ) : null}

              {r.status === "APPROVED" && !r.doctor_reply ? (
                <div className="space-y-2">
                  <Label htmlFor={`reply-${r.id}`}>پاسخ عمومی</Label>
                  <textarea
                    id={`reply-${r.id}`}
                    rows={3}
                    value={drafts[r.id] ?? ""}
                    onChange={(e) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [r.id]: e.target.value,
                      }))
                    }
                    placeholder="پاسخ خود را بنویسید…"
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  <Button
                    size="sm"
                    disabled={
                      replyMutation.isPending ||
                      !(drafts[r.id] ?? "").trim()
                    }
                    onClick={() => submitReply(r)}
                  >
                    <Send className="size-3.5" />
                    ارسال پاسخ
                  </Button>
                </div>
              ) : null}

              {r.status === "PENDING" ? (
                <p className="text-xs text-muted-foreground">
                  پس از تأیید ادمین می‌توانید پاسخ عمومی ثبت کنید.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
