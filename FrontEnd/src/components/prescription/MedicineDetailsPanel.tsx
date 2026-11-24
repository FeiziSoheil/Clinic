"use client";

/**
 * MedicineDetailsPanel — clean, normalized clinical detail for a selected
 * medicine.
 *
 * Shown when a medicine is selected. It fetches {@link useMedicineDetail} by
 * `rxcui` and renders the generic name (bold, large), brand names as badges,
 * strength / dosage forms / route, and a muted synonyms line. RxNorm raw
 * concepts are never surfaced — only the backend-normalized fields. Includes a
 * loading skeleton and a graceful empty state.
 */

import { Loader2, Pill } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useMedicineDetail } from "@/hooks/useMedicines";
import { cn } from "@/lib/utils";

export interface MedicineDetailsPanelProps {
  /** RxCUI of the selected medicine. When falsy, nothing is rendered. */
  rxcui?: string | null;
  className?: string;
}

export function MedicineDetailsPanel({
  rxcui,
  className,
}: MedicineDetailsPanelProps) {
  const detail = useMedicineDetail(rxcui ?? null);

  if (!rxcui) {
    return null;
  }

  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 text-card-foreground",
        className,
      )}
    >
      {detail.isLoading ? (
        <DetailsSkeleton />
      ) : detail.isError || !detail.data ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Pill className="size-4" />
          بارگذاری جزئیات دارو ناموفق بود.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-baseline gap-2">
            <Pill className="size-4 text-muted-foreground" />
            <span className="text-base font-semibold">
              {detail.data.generic_name}
            </span>
            {detail.data.strength ? (
              <span className="text-sm text-muted-foreground">
                {detail.data.strength}
              </span>
            ) : null}
            <Badge variant="outline" className="font-normal">
              {detail.data.is_combination
                ? "ترکیبی"
                : detail.data.category === "brand"
                  ? "تجاری"
                  : "ژنریک"}
            </Badge>
          </div>

          {detail.data.ingredients.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">ترکیبات:</span>
              {detail.data.ingredients.map((ing) => {
                const strengthUnit = [ing.strength, ing.unit]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <Badge
                    key={`${ing.name}-${ing.strength}`}
                    variant="secondary"
                    className="font-normal"
                  >
                    {ing.name}
                    {strengthUnit ? ` (${strengthUnit})` : ""}
                  </Badge>
                );
              })}
            </div>
          ) : null}

          {detail.data.brand_names.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">نام‌های تجاری:</span>
              {detail.data.brand_names.map((b) => (
                <Badge key={b} variant="secondary" className="font-normal">
                  {b}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {detail.data.route ? <span>طریق: {detail.data.route}</span> : null}
            {detail.data.dosage_form ? (
              <span>شکل دارویی: {detail.data.dosage_form}</span>
            ) : null}
            {detail.data.synonyms.length > 0 ? (
              <span className="min-w-0 truncate">
                مترادف: {detail.data.synonyms.join("، ")}
              </span>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Skeleton className="size-4 rounded" />
        <Skeleton className="h-4 w-32" />
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
      </div>
      <div className="flex gap-1.5">
        <Skeleton className="h-5 w-16 rounded-md" />
        <Skeleton className="h-5 w-16 rounded-md" />
      </div>
      <Skeleton className="h-3 w-48" />
    </div>
  );
}
