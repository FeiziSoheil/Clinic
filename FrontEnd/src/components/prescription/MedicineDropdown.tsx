"use client";

/**
 * MedicineDropdown — EHR-style results dropdown for the medicine combobox.
 *
 * Renders the ranked results grouped into **Generic Medicines** and **Brand
 * Medicines** sections with localized headers (spec §11). The parent combobox
 * owns the keyboard-navigable highlight index and passes results already
 * partitioned into generic-first then-brand flat order; this component maps each
 * rendered row back to that flat index so arrow-key navigation and mouse hover
 * stay in sync.
 *
 * States: loading skeleton, "type at least 2 characters" hint, "no medicines
 * found" empty state, and the grouped results. Raw RxNorm descriptions / rxcui
 * are never shown.
 */

import { SearchX } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  MedicineResultItem,
} from "./MedicineResultItem";
import type { MedicineSearchResult } from "@/types/medicine";

/**
 * Split results into the three clinical display sections, grouped by
 * {@link Category}: generics first, then brands, then combinations (the same
 * order the backend ranks them). Exported so the combobox can produce the same
 * flat order it uses for keyboard navigation.
 */
export function partitionBySection(results: MedicineSearchResult[]): {
  generic: MedicineSearchResult[];
  brand: MedicineSearchResult[];
  combination: MedicineSearchResult[];
} {
  const generic: MedicineSearchResult[] = [];
  const brand: MedicineSearchResult[] = [];
  const combination: MedicineSearchResult[] = [];
  for (const r of results) {
    if (r.category === "combination") {
      combination.push(r);
    } else if (r.category === "brand") {
      brand.push(r);
    } else {
      generic.push(r);
    }
  }
  return { generic, brand, combination };
}

export interface MedicineDropdownProps {
  /** Results already partitioned generic-first then brand (the flat order). */
  results: MedicineSearchResult[];
  /** Whether a query is in flight (shows the skeleton). */
  loading: boolean;
  /** The current (debounced, trimmed) query — drives the empty/hint states. */
  query: string;
  /** Active keyboard-highlight index into {@link results}. */
  highlightedIndex: number;
  /** RxCUI of the currently selected value (marks the active row). */
  selectedRxcui?: string;
  /** Select a medicine (row click). */
  onSelect: (medicine: MedicineSearchResult) => void;
  /** Mouse hover/focus → sync the highlight. */
  onHover: (index: number) => void;
  /** id linking the listbox to the combobox input (aria-controls). */
  id?: string;
  className?: string;
}

const MIN_QUERY_LENGTH = 2;

export function MedicineDropdown({
  results,
  loading,
  query,
  highlightedIndex,
  selectedRxcui,
  onSelect,
  onHover,
  id,
  className,
}: MedicineDropdownProps) {
  const { generic, brand, combination } = partitionBySection(results);

  return (
    <div
      id={id}
      role="listbox"
      aria-label="نتایج جستجوی دارو"
      className={cn(
        "absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
        className,
      )}
    >
      {loading ? (
        <LoadingRows />
      ) : query.trim().length < MIN_QUERY_LENGTH ? (
        <HintRow>برای جستجو حداقل دو حرف تایپ کنید.</HintRow>
      ) : results.length === 0 ? (
        <EmptyRow query={query} />
      ) : (
        <>
          {generic.length > 0 ? (
            <Section title="داروهای ژنریک">
              {generic.map((m, i) => (
                <MedicineResultItem
                  key={`${m.rxcui}-g`}
                  medicine={m}
                  index={i}
                  highlighted={highlightedIndex === i}
                  selected={selectedRxcui === m.rxcui}
                  onSelect={onSelect}
                  onHover={onHover}
                />
              ))}
            </Section>
          ) : null}

          {brand.length > 0 ? (
            <Section title="داروهای تجاری">
              {brand.map((m, j) => {
                const flatIndex = generic.length + j;
                return (
                  <MedicineResultItem
                    key={`${m.rxcui}-b`}
                    medicine={m}
                    index={flatIndex}
                    highlighted={highlightedIndex === flatIndex}
                    selected={selectedRxcui === m.rxcui}
                    onSelect={onSelect}
                    onHover={onHover}
                  />
                );
              })}
            </Section>
          ) : null}

          {combination.length > 0 ? (
            <Section title="داروهای ترکیبی">
              {combination.map((m, k) => {
                const flatIndex = generic.length + brand.length + k;
                return (
                  <MedicineResultItem
                    key={`${m.rxcui}-c`}
                    medicine={m}
                    index={flatIndex}
                    highlighted={highlightedIndex === flatIndex}
                    selected={selectedRxcui === m.rxcui}
                    onSelect={onSelect}
                    onHover={onHover}
                  />
                );
              })}
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="px-2 py-1 text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      {children}
    </div>
  );
}

function HintRow({ children }: { children: React.ReactNode }) {
  return <div className="px-3 py-3 text-sm text-muted-foreground">{children}</div>;
}

function EmptyRow({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center gap-1 px-3 py-6 text-center text-sm text-muted-foreground">
      <SearchX className="size-5" />
      <span>دارویی برای «{query}» یافت نشد.</span>
    </div>
  );
}

function LoadingRows() {
  return (
    <div className="space-y-1 p-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-2">
          <Skeleton className="size-4 rounded" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="size-4 rounded" />
        </div>
      ))}
    </div>
  );
}
