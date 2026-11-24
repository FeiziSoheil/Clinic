"use client";

/**
 * FavoriteMedicines — favorites quick-add row, powered by the backend.
 *
 * Renders the current doctor's favorited medicines (from
 * {@link useFavoriteMedicines}) as a chip row. Each chip fetches its display name
 * via {@link useMedicineDetail}; clicking the chip selects the medicine (mapped
 * to a {@link MedicineSearchResult}), and the ⭐ button removes it from favorites
 * (spec §12 clinical shortcut). Favorites are doctor-scoped and resolved from
 * the JWT on the backend.
 */

import { Loader2, Star, X } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  useFavoriteMedicines,
  useMedicineDetail,
  useRemoveFavoriteMedicine,
} from "@/hooks/useMedicines";
import { detailToSearchResult } from "@/lib/medicine-api";
import { cn } from "@/lib/utils";
import type { MedicineSearchResult } from "@/types/medicine";
export interface FavoriteMedicinesProps {
  /** Emitted (with a full search result) when a favorite chip is clicked. */
  onSelect: (medicine: MedicineSearchResult) => void;
  /** Render nothing when the doctor has no favorites (default `true`). */
  emptyHidden?: boolean;
  className?: string;
}

export function FavoriteMedicines({
  onSelect,
  emptyHidden = true,
  className,
}: FavoriteMedicinesProps) {
  const favorites = useFavoriteMedicines();

  if (favorites.isLoading) {
    return (
      <div className={cn("space-y-1.5", className)}>
        <Header />
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-24 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  const list = favorites.data ?? [];

  if (list.length === 0) {
    return emptyHidden ? null : (
      <p className="text-xs text-muted-foreground">هنوز دارویی به منتخب‌ها اضافه نکرده‌اید.</p>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <Header />
      <div className="flex flex-wrap gap-1.5">
        {list.map((f) => (
          <FavoriteChip key={f.rxcui} rxcui={f.rxcui} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <Star className="size-3.5 fill-current text-amber-500" />
      <span>داروهای منتخب</span>
    </div>
  );
}

function FavoriteChip({
  rxcui,
  onSelect,
}: {
  rxcui: string;
  onSelect: (medicine: MedicineSearchResult) => void;
}) {
  const detail = useMedicineDetail(rxcui);
  const remove = useRemoveFavoriteMedicine();

  return (
    <span className="group inline-flex items-center gap-1 rounded-full border bg-background pl-1 pr-2.5 text-xs transition-colors hover:bg-accent hover:text-accent-foreground">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 py-1"
        onClick={() => {
          if (detail.data) {
            onSelect(detailToSearchResult(detail.data));
          }
        }}
        disabled={!detail.data}
      >
        <Star className="size-3.5 fill-current text-amber-500" />
        {detail.isLoading ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
        ) : detail.data ? (
          <span className="font-medium">{detail.data.generic_name}</span>
        ) : (
          <span className="text-muted-foreground">…</span>
        )}
      </button>
      <button
        type="button"
        aria-label="حذف از منتخب‌ها"
        disabled={remove.isPending}
        onClick={(e) => {
          e.stopPropagation();
          remove.mutate(rxcui);
        }}
        className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}
