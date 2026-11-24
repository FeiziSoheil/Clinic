"use client";

/**
 * ============================================================================
 * CLINICK — DOCTOR DISCOVERY VIEW (spec §5)
 * ============================================================================
 * Client-side discovery experience: specialty facet chips + sort + a
 * responsive doctor grid. Filter/sort state is owned by the URL and passed
 * in from the server page (shareable + back/forward). Data is fetched via
 * `useDoctors` / `useSpecialties` (mock-toggle ready).
 *
 * Sorting is applied client-side (the public list endpoint doesn't sort yet),
 * and a live region announces the result count to assistive tech.
 * ============================================================================
 */

import { useMemo } from "react";
import { useRouter, usePathname } from "next/navigation";
import { SearchX } from "lucide-react";

import { useDoctors, useSpecialties } from "@/hooks/useDoctors";
import type { Doctor } from "@/types/doctor";
import { cn, toPersianDigits } from "@/lib/utils";
import { DoctorCard, DoctorCardSkeleton } from "./DoctorCard";
import { QuickFilterChip } from "@/components/booking/QuickFilterChip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type DoctorSort = "rating" | "fee" | "name";

const SORT_OPTIONS: { value: DoctorSort; label: string }[] = [
  { value: "rating", label: "بالاترین امتیاز" },
  { value: "fee", label: "کم‌ترین هزینه" },
  { value: "name", label: "نام (الفبا)" },
];

function parseSort(value: string | undefined): DoctorSort {
  if (value === "fee" || value === "name" || value === "rating") return value;
  return "rating";
}

/** Apply the client-side sort the user picked (backend list is unsorted). */
function sortDoctors(list: Doctor[], sort: DoctorSort): Doctor[] {
  const copy = [...list];
  switch (sort) {
    case "fee":
      return copy.sort((a, b) => a.visit_fee - b.visit_fee);
    case "name":
      return copy.sort((a, b) => a.full_name.localeCompare(b.full_name, "fa"));
    case "rating":
    default:
      return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
  }
}

export function DiscoveryView({
  specialty,
  search,
  sort: sortParam,
}: {
  specialty?: string;
  search?: string;
  sort?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sort = parseSort(sortParam);

  const doctorsQuery = useDoctors({ specialty, search });
  const specialtiesQuery = useSpecialties();

  const doctors = useMemo(
    () => sortDoctors(doctorsQuery.data ?? [], sort),
    [doctorsQuery.data, sort],
  );

  /** Update one URL param while preserving the others (shareable URLs). */
  const updateParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams();
    if (specialty) next.set("specialty", specialty);
    if (search) next.set("q", search);
    if (sort !== "rating") next.set("sort", sort);

    if (value) next.set(key, value);
    else next.delete(key);

    // Default sort stays out of the URL.
    if (key === "sort" && value === "rating") next.delete("sort");

    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const isLoading = doctorsQuery.isLoading;
  const isError = doctorsQuery.isError;
  const isEmpty = !isLoading && !isError && doctors.length === 0;
  const specialties = specialtiesQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      {/* Specialty facet rail */}
      <div
        className="flex flex-wrap items-center gap-2"
        role="group"
        aria-label="فیلتر بر اساس تخصص"
      >
        <QuickFilterChip
          active={!specialty}
          onClick={() => updateParam("specialty", undefined)}
        >
          همه
        </QuickFilterChip>
        {specialties.map((s) => (
          <QuickFilterChip
            key={s}
            active={specialty === s}
            onClick={() =>
              updateParam("specialty", specialty === s ? undefined : s)
            }
          >
            {s}
          </QuickFilterChip>
        ))}
      </div>

      {/* Toolbar: count + sort */}
      <div className="flex items-center justify-between gap-4">
        <p
          className="text-sm text-muted-foreground"
          aria-live="polite"
          role="status"
        >
          {isLoading
            ? "در حال جستجو…"
            : `${toPersianDigits(doctors.length.toString())} پزشک یافت شد`}
        </p>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">مرتب‌سازی:</span>
          <Select
            value={sort}
            onValueChange={(v) => updateParam("sort", v as DoctorSort)}
          >
            <SelectTrigger className="w-44" aria-label="مرتب‌سازی پزشکان">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      </div>

      {/* Results */}
      {isError ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          خطا در بارگذاری پزشکان.{" "}
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => doctorsQuery.refetch()}
          >
            تلاش مجدد
          </button>
        </div>
      ) : isEmpty ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/30 py-16 text-center">
          <SearchX className="size-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-lg font-semibold">پزشکی مطابق فیلترها یافت نشد</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            فیلترها را تغییر دهید یا همهٔ تخصص‌ها را ببینید.
          </p>
          <button
            type="button"
            className="mt-1 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-brand-foreground transition-colors hover:bg-brand/90"
            onClick={() => {
              const next = new URLSearchParams();
              if (sort !== "rating") next.set("sort", sort);
              const qs = next.toString();
              router.replace(qs ? `${pathname}?${qs}` : pathname, {
                scroll: false,
              });
            }}
          >
            حذف فیلترها
          </button>
        </div>
      ) : (
        <div
          className={cn(
            "grid grid-cols-1 gap-5 sm:grid-cols-2",
            "lg:grid-cols-3",
          )}
        >
          {isLoading
            ? Array.from({ length: 6 }).map((_, i) => (
                <DoctorCardSkeleton key={i} />
              ))
            : doctors.map((d) => <DoctorCard key={d.id} doctor={d} />)}
        </div>
      )}
    </div>
  );
}
