"use client";

/**
 * ============================================================================
 * CLINICK — INTELLIGENT SEARCH BAR (spec §2)
 * ============================================================================
 * The hero's primary entry point into the booking journey. A real `<form>`
 * that GETs to `/doctors` (so it's crawlable + shareable) combining a free-
 * text query with an optional specialty scope. The popular searches render as
 * real links so search engines can follow them.
 * ============================================================================
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { useSpecialties } from "@/hooks/useDoctors";
import { cn } from "@/lib/utils";
import { QuickFilterChip } from "@/components/booking/QuickFilterChip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const POPULAR_SEARCHES = ["قلب و عروق", "دندان‌پزشکی", "اطفال", "داخلی"];

export interface IntelligentSearchBarProps {
  className?: string;
  /** Default query/specialty values (prefilled when reused on /doctors). */
  defaultQuery?: string;
  defaultSpecialty?: string;
}

export function IntelligentSearchBar({
  className,
  defaultQuery = "",
  defaultSpecialty = "",
}: IntelligentSearchBarProps) {
  const router = useRouter();
  const { data: specialties } = useSpecialties();
  const [query, setQuery] = useState(defaultQuery);
  const [specialty, setSpecialty] = useState(defaultSpecialty);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (specialty) params.set("specialty", specialty);
    const qs = params.toString();
    router.push(qs ? `/doctors?${qs}` : "/doctors");
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <form
        role="search"
        onSubmit={submit}
        className="flex flex-col gap-2 sm:flex-row sm:items-stretch"
        aria-label="جستجوی پزشک"
      >
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute start-3.5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="نام پزشک، تخصص یا نشانه…"
            aria-label="جستجوی پزشک، تخصص یا نشانه"
            className="box-border h-14 w-full rounded-2xl border border-border bg-card ps-12 pe-4 text-base shadow-soft outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand"
          />
        </div>

        <Select
          value={specialty || undefined}
          onValueChange={setSpecialty}
        >
          <SelectTrigger
            className="box-border h-14 w-full rounded-2xl border-border bg-card px-4 text-base shadow-soft data-[size=default]:h-14 sm:w-56"
            aria-label="انتخاب تخصص"
          >
            <SelectValue placeholder="همهٔ تخصص‌ها" />
          </SelectTrigger>
          <SelectContent>
            {(specialties ?? []).map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <button
          type="submit"
          className="box-border h-14 shrink-0 rounded-2xl bg-brand px-8 text-base font-semibold text-brand-foreground shadow-soft transition-all hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:translate-y-px"
        >
          جستجو
        </button>
      </form>

      {/* Popular searches — real links for crawlability + 1-tap access */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-meta text-muted-foreground">پرجستجو:</span>
        {POPULAR_SEARCHES.map((term) => (
          <QuickFilterChip
            key={term}
            onClick={() => {
              setQuery(term);
              router.push(`/doctors?q=${encodeURIComponent(term)}`);
            }}
          >
            {term}
          </QuickFilterChip>
        ))}
      </div>
    </div>
  );
}
