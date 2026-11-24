"use client";

/**
 * Admin review moderation page.
 *
 * Lists patient reviews with status / doctor filters and actions to approve,
 * reject, or hide an already-approved review (approved → rejected).
 */

import { useMemo, useState } from "react";
import { Check, EyeOff, Loader2, MessageSquareText, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminDoctors } from "@/hooks/useAdminDoctors";
import { useAdminReviews, useModerateReview } from "@/hooks/useReviews";
import { formatJalaliLabel } from "@/lib/jalali";
import { toPersianDigits } from "@/lib/utils";
import type { ReviewRecord, ReviewStatus } from "@/types/review";

const ALL_DOCTORS = "__all__";
const ALL_STATUSES = "__all__";

const STATUS_LABEL: Record<ReviewStatus, string> = {
  PENDING: "در انتظار",
  APPROVED: "تأییدشده",
  REJECTED: "رد / پنهان",
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

export default function AdminReviewsPage() {
  const [doctorFilter, setDoctorFilter] = useState(ALL_DOCTORS);
  const [statusFilter, setStatusFilter] = useState(ALL_STATUSES);

  const { data: doctors = [] } = useAdminDoctors();
  const doctorId =
    doctorFilter === ALL_DOCTORS ? undefined : doctorFilter;
  const status =
    statusFilter === ALL_STATUSES
      ? ("" as const)
      : (statusFilter as ReviewStatus);

  const { data: reviews, isLoading, isError } = useAdminReviews({
    status,
    doctorId,
  });
  const moderate = useModerateReview();

  const doctorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of doctors) {
      map.set(d.id, `${d.first_name} ${d.last_name}`);
      if (d.user_id) map.set(d.user_id, `${d.first_name} ${d.last_name}`);
    }
    return map;
  }, [doctors]);

  const list = reviews ?? [];

  function doctorLabel(r: ReviewRecord): string {
    return (
      doctorNameById.get(r.doctor_profile_id ?? "") ??
      doctorNameById.get(r.doctor_id) ??
      "—"
    );
  }

  async function setStatus(id: string, next: ReviewStatus) {
    await moderate.mutateAsync({ id, status: next });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">مدیریت نظرات</h1>
        <p className="text-sm text-muted-foreground">
          تأیید، رد یا پنهان‌سازی نظرات بیماران. فقط نظرات تأییدشده در پروفایل
          عمومی نمایش داده می‌شوند.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:max-w-xs">
            <SelectValue placeholder="وضعیت" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUSES}>همه وضعیت‌ها</SelectItem>
            <SelectItem value="PENDING">در انتظار</SelectItem>
            <SelectItem value="APPROVED">تأییدشده</SelectItem>
            <SelectItem value="REJECTED">رد / پنهان</SelectItem>
          </SelectContent>
        </Select>

        <Select value={doctorFilter} onValueChange={setDoctorFilter}>
          <SelectTrigger className="w-full sm:max-w-xs">
            <SelectValue placeholder="پزشک" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_DOCTORS}>همه پزشکان</SelectItem>
            {doctors.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.first_name} {d.last_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          در حال بارگذاری…
        </div>
      )}

      {isError && (
        <p className="py-10 text-center text-sm text-destructive">
          بارگذاری نظرات ناموفق بود.
        </p>
      )}

      {!isLoading && !isError && list.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <MessageSquareText className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">نظری یافت نشد.</p>
          </CardContent>
        </Card>
      )}

      {!isLoading && !isError && list.length > 0 && (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>پزشک</TableHead>
                  <TableHead>امتیاز</TableHead>
                  <TableHead>متن</TableHead>
                  <TableHead>وضعیت</TableHead>
                  <TableHead>تاریخ</TableHead>
                  <TableHead className="text-left">اقدامات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {doctorLabel(r)}
                    </TableCell>
                    <TableCell>
                      {toPersianDigits(String(r.rating))} / ۵
                    </TableCell>
                    <TableCell className="max-w-sm truncate">{r.body}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(r.status)}>
                        {STATUS_LABEL[r.status]}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {formatJalaliLabel(r.created_at.slice(0, 10), "short")}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-2">
                        {r.status !== "APPROVED" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={moderate.isPending}
                            onClick={() => setStatus(r.id, "APPROVED")}
                          >
                            <Check className="size-3.5" />
                            تأیید
                          </Button>
                        )}
                        {r.status !== "REJECTED" && (
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={moderate.isPending}
                            onClick={() => setStatus(r.id, "REJECTED")}
                          >
                            {r.status === "APPROVED" ? (
                              <EyeOff className="size-3.5" />
                            ) : (
                              <X className="size-3.5" />
                            )}
                            {r.status === "APPROVED" ? "پنهان" : "رد"}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile cards */}
          <div className="flex flex-col gap-3 md:hidden">
            {list.map((r) => (
              <Card key={r.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{doctorLabel(r)}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatJalaliLabel(r.created_at.slice(0, 10), "short")} ·{" "}
                        {toPersianDigits(String(r.rating))} ستاره
                      </p>
                    </div>
                    <Badge variant={statusVariant(r.status)}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                  <p className="text-sm leading-relaxed">{r.body}</p>
                  <div className="flex flex-wrap gap-2">
                    {r.status !== "APPROVED" && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={moderate.isPending}
                        onClick={() => setStatus(r.id, "APPROVED")}
                      >
                        تأیید
                      </Button>
                    )}
                    {r.status !== "REJECTED" && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={moderate.isPending}
                        onClick={() => setStatus(r.id, "REJECTED")}
                      >
                        {r.status === "APPROVED" ? "پنهان" : "رد"}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
