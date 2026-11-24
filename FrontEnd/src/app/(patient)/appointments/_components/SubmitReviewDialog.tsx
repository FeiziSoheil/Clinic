"use client";

/**
 * Dialog for a patient to submit a star rating + comment after a completed visit.
 * One review per completed appointment (enforced by the backend).
 */

import { useState } from "react";
import { Star } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useCreateReview } from "@/hooks/useReviews";
import { cn } from "@/lib/utils";

export interface ReviewableAppointment {
  id: string;
  doctorName: string;
}

export function SubmitReviewDialog({
  appointment,
  open,
  onOpenChange,
}: {
  appointment: ReviewableAppointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const create = useCreateReview();
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");

  function reset() {
    setRating(5);
    setBody("");
  }

  async function handleSubmit() {
    if (!appointment) return;
    await create.mutateAsync({
      appointment_id: appointment.id,
      rating,
      body: body.trim(),
    });
    reset();
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>ثبت نظر</DialogTitle>
          <DialogDescription>
            {appointment
              ? `نظر شما دربارهٔ ویزیت با ${appointment.doctorName} پس از تأیید ادمین نمایش داده می‌شود.`
              : "نظر خود را ثبت کنید."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>امتیاز</Label>
            <div className="flex items-center gap-1" role="radiogroup" aria-label="امتیاز">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={`${n} از ۵`}
                  onClick={() => setRating(n)}
                  className={cn(
                    "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    n <= rating ? "text-amber-400" : "text-muted-foreground/40",
                  )}
                >
                  <Star
                    className="size-7"
                    fill={n <= rating ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="review-body">متن نظر</Label>
            <textarea
              id="review-body"
              rows={4}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="تجربهٔ خود از این ویزیت را بنویسید…"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={create.isPending}
          >
            انصراف
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={create.isPending || body.trim().length < 3}
          >
            {create.isPending ? "در حال ثبت…" : "ثبت نظر"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
