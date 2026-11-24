"use client";

/**
 * Doctor view of the AI pre-visit report for the current appointment.
 */

import { useState } from "react";
import { Loader2, MessagesSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  usePrevisitMessages,
  usePrevisitSession,
} from "@/hooks/usePrevisit";
import { buildSubjectiveDraft } from "@/lib/previsit-draft";

export interface PreVisitReportPanelProps {
  appointmentId: string;
  onApplyDraft: (subjective: string) => void;
  currentSubjective?: string;
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: "شروع نشده",
  IN_PROGRESS: "در حال تکمیل",
  COMPLETED: "تکمیل‌شده",
  EXPIRED: "منقضی",
};

export function PreVisitReportPanel({
  appointmentId,
  onApplyDraft,
  currentSubjective = "",
}: PreVisitReportPanelProps) {
  const [showTranscript, setShowTranscript] = useState(false);
  const sessionQuery = usePrevisitSession(appointmentId);
  const messagesQuery = usePrevisitMessages(appointmentId, showTranscript);

  if (sessionQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        در حال بارگذاری گزارش پیش‌ویزیت…
      </div>
    );
  }

  if (sessionQuery.isError || !sessionQuery.data) {
    return (
      <p className="text-sm text-muted-foreground">
        بیمار هنوز گفت‌وگوی پیش‌ویزیت را شروع نکرده است.
      </p>
    );
  }

  const session = sessionQuery.data;

  if (session.status !== "COMPLETED" || !session.report) {
    return (
      <div className="space-y-2 text-sm">
        <Badge variant="secondary">
          {STATUS_LABEL[session.status] ?? session.status}
        </Badge>
        <p className="text-muted-foreground">
          گزارش هنوز آماده نیست. ویزیت بدون این گزارش هم قابل انجام است.
        </p>
      </div>
    );
  }

  const report = session.report;

  function applyDraft() {
    const draft = buildSubjectiveDraft(report);
    if (currentSubjective.trim()) {
      const ok = window.confirm(
        "فیلد Subjective از قبل مقدار دارد. با پیش‌نویس گزارش جایگزین شود؟",
      );
      if (!ok) return;
    }
    onApplyDraft(draft);
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">تکمیل‌شده</Badge>
        {report.model ? (
          <span className="text-xs text-muted-foreground">مدل: {report.model}</span>
        ) : null}
      </div>

      <Field label="شکایت اصلی" value={report.chief_complaint} />
      <Field label="خلاصه" value={report.summary_fa} />
      <Field label="داروها" value={report.medications} />
      <Field label="حساسیت‌ها" value={report.allergies} />
      <Field label="سابقه مرتبط" value={report.relevant_history} />

      {report.notable_flags && report.notable_flags.length > 0 ? (
        <div>
          <div className="mb-1 font-medium">پرچم‌های قابل‌توجه</div>
          <ul className="list-disc space-y-1 pe-5 text-amber-800 dark:text-amber-200">
            {report.notable_flags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        <Button type="button" size="sm" onClick={applyDraft}>
          پر کردن پیش‌نویس SOAP (Subjective)
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowTranscript((v) => !v)}
        >
          <MessagesSquare className="size-4" />
          {showTranscript ? "بستن گفت‌وگو" : "مشاهده گفت‌وگوی کامل"}
        </Button>
      </div>

      {showTranscript ? (
        <div className="max-h-64 space-y-2 overflow-y-auto rounded-md border bg-muted/20 p-3">
          {messagesQuery.isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              بارگذاری…
            </div>
          ) : (
            (messagesQuery.data ?? []).map((m) => (
              <div key={m.id} className="text-xs">
                <span className="font-medium">
                  {m.role === "user" ? "بیمار" : "دستیار"}:
                </span>{" "}
                {m.content}
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string }) {
  if (!value?.trim()) return null;
  return (
    <div>
      <div className="mb-0.5 font-medium">{label}</div>
      <p className="whitespace-pre-wrap text-muted-foreground">{value}</p>
    </div>
  );
}
