import type { PreVisitReport } from "@/types/previsit";

/** Map a completed pre-visit report into SOAP Subjective draft text. */
export function buildSubjectiveDraft(r: PreVisitReport): string {
  const lines = [
    r.chief_complaint && `شکایت اصلی: ${r.chief_complaint}`,
    r.summary_fa && `خلاصه پیش‌ویزیت: ${r.summary_fa}`,
    r.medications && `داروها: ${r.medications}`,
    r.allergies && `حساسیت‌ها: ${r.allergies}`,
    r.relevant_history && `سابقه: ${r.relevant_history}`,
  ].filter(Boolean);
  return lines.join("\n");
}
