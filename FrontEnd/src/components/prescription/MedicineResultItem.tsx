"use client";

/**
 * MedicineSearchInput — single EHR-style result row.
 *
 * Renders a normalized clinical view of one {@link MedicineSearchResult}:
 * a pill glyph, the generic name (bold), the primary brand name, a muted
 * subtitle of strength + dosage form + route, and a colored {@link Badge}
 * for the {@link MatchType} relevance tier. A ⭐ button toggles the medicine in
 * the doctor's favorites.
 *
 * RxNorm raw descriptions and the raw `rxcui` are NEVER surfaced here — only the
 * normalized, human-friendly fields.
 */

import { Pill, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useToggleFavorite } from "@/hooks/useMedicines";
import type { MatchType, MedicineSearchResult } from "@/types/medicine";

/**
 * Visual mapping for each match tier: a short localized label + Tailwind color
 * classes (exact=green, prefix=blue, fuzzy=amber, brand=purple, synonym=gray),
 * per the spec. Exported so other views (e.g. details) can reuse the labels.
 */
export const MATCH_TYPE_META: Record<
  MatchType,
  { label: string; className: string }
> = {
  exact_generic: {
    label: "دقیق",
    className:
      "border-green-200 bg-green-100 text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-300",
  },
  prefix_generic: {
    label: "پیشوند",
    className:
      "border-blue-200 bg-blue-100 text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300",
  },
  exact_brand: {
    label: "تجاری",
    className:
      "border-purple-200 bg-purple-100 text-purple-800 dark:border-purple-900 dark:bg-purple-950 dark:text-purple-300",
  },
  prefix_brand: {
    label: "تجاری",
    className:
      "border-fuchsia-200 bg-fuchsia-100 text-fuchsia-800 dark:border-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-300",
  },
  fuzzy: {
    label: "مشابه",
    className:
      "border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300",
  },
  synonym: {
    label: "مترادف",
    className:
      "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300",
  },
  combination: {
    label: "ترکیبی",
    className:
      "border-orange-200 bg-orange-100 text-orange-800 dark:border-orange-900 dark:bg-orange-950 dark:text-orange-300",
  },
};

/**
 * Build the muted subtitle (strength · form · route), omitting empty parts.
 * Exported so the dropdown/details panel can render the same string.
 */
export function buildMedicineSubtitle(m: {
  strength?: string;
  form?: string;
  route?: string;
}): string {
  return [m.strength, m.form, m.route].filter(Boolean).join(" · ");
}

export interface MedicineResultItemProps {
  /** The result to render. */
  medicine: MedicineSearchResult;
  /** Position in the dropdown's flat, keyboard-navigable list. */
  index: number;
  /** Whether this row is the active keyboard highlight. */
  highlighted?: boolean;
  /** Whether this row is the currently selected value. */
  selected?: boolean;
  /** Select the medicine (row click / Enter). */
  onSelect: (medicine: MedicineSearchResult) => void;
  /** Hover/focus the row (drives keyboard highlight sync). */
  onHover: (index: number) => void;
}

export function MedicineResultItem({
  medicine,
  index,
  highlighted = false,
  selected = false,
  onSelect,
  onHover,
}: MedicineResultItemProps) {
  const { isFavorite, toggle, isPending } = useToggleFavorite();
  const favorite = isFavorite(medicine.rxcui);
  const subtitle = buildMedicineSubtitle(medicine);
  const badge = MATCH_TYPE_META[medicine.match_type];
  const primaryBrand = medicine.brand_name ?? medicine.brand_names[0];

  return (
    <div
      role="option"
      id={`medicine-option-${index}`}
      aria-selected={selected}
      data-highlighted={highlighted ? "" : undefined}
      className={cn(
        "flex cursor-pointer items-start gap-2.5 px-3 py-2 outline-none",
        highlighted ? "bg-accent" : "hover:bg-accent",
      )}
      onClick={() => onSelect(medicine)}
      onMouseEnter={() => onHover(index)}
    >
      <Pill className="mt-0.5 size-4 shrink-0 text-muted-foreground" />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-medium text-sm">
            {medicine.generic_name}
          </span>
          <Badge variant="outline" className={cn("shrink-0", badge.className)}>
            {badge.label}
          </Badge>
        </div>

        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {primaryBrand ? (
            <span className="truncate">{primaryBrand}</span>
          ) : null}
          {primaryBrand && subtitle ? <span aria-hidden>·</span> : null}
          {subtitle ? <span className="truncate">{subtitle}</span> : null}
        </div>
      </div>

      {/* Favorite toggle — stops propagation so it never selects the row. */}
      <button
        type="button"
        aria-label={favorite ? "حذف از منتخب‌ها" : "افزودن به منتخب‌ها"}
        aria-pressed={favorite}
        disabled={isPending}
        tabIndex={-1}
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          favorite && "text-amber-500 hover:text-amber-600",
        )}
        onClick={(e) => {
          e.stopPropagation();
          toggle(medicine.rxcui);
        }}
      >
        <Star className={cn("size-4", favorite && "fill-current")} />
      </button>
    </div>
  );
}
