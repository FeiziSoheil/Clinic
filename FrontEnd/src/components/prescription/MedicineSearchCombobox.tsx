"use client";

/**
 * MedicineSearchCombobox — the top-level, controlled medicine search widget.
 *
 * Owns the three concerns the spec keeps separate (§13):
 *  1. **search state** — the query string + a 350ms debounce that drives
 *     {@link useMedicineSearch};
 *  2. **open/close + selection UI** — dropdown visibility, outside-click,
 *     keyboard navigation (arrow up/down, enter, esc), and the loading spinner;
 *  3. it **emits** a {@link MedicineSearchResult} via `onChange` and is driven by
 *     a controlled `value`, so the parent's prescription-form logic stays intact.
 *
 * It composes {@link MedicineSearchInput} + {@link MedicineDropdown}; the parent
 * (e.g. `DrugLineRow`) maps the selected medicine to the prescription line.
 *
 * Implementation note: prop-derived state (displayed text, highlight reset) is
 * adjusted *during render* rather than via `setState`-in-`useEffect`, per the
 * project's `react-hooks/set-state-in-effect` lint rule and React's own guidance.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";

import { MedicineDropdown, partitionBySection } from "./MedicineDropdown";
import { MedicineSearchInput } from "./MedicineSearchInput";
import { useMedicineSearch } from "@/hooks/useMedicines";
import { cn } from "@/lib/utils";
import type { MedicineSearchResult } from "@/types/medicine";

/** Debounce window for the typed query before hitting the search query. */
const DEBOUNCE_MS = 350;
/** Minimum query length before the search is enabled. */
const MIN_QUERY_LENGTH = 2;

export interface MedicineSearchComboboxProps {
  /** Currently selected medicine (drives the displayed text). */
  value: MedicineSearchResult | null;
  /** Emitted when the doctor picks a medicine from the dropdown. */
  onChange: (medicine: MedicineSearchResult) => void;
  placeholder?: string;
  id?: string;
  className?: string;
}

/** Debounce a value by `delay` ms (re-rendered value lags the input). */
function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function MedicineSearchCombobox({
  value,
  onChange,
  placeholder = "نام دارو را جستجو کنید...",
  id,
  className,
}: MedicineSearchComboboxProps) {
  const listboxId = useId();

  // Search state: the immediate text the doctor types.
  const [inputValue, setInputValue] = useState<string>(
    value?.generic_name ?? "",
  );
  // Adjust the displayed text during render when the controlled value changes
  // (selection from dropdown / favorites / recents, or a clear) — no effect.
  const [prevSelectedRxcui, setPrevSelectedRxcui] = useState<string | undefined>(
    value?.rxcui,
  );
  if (value?.rxcui !== prevSelectedRxcui) {
    setPrevSelectedRxcui(value?.rxcui);
    setInputValue(value ? value.generic_name : "");
  }

  // Open/close + keyboard highlight.
  const [open, setOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);

  const debouncedQuery = useDebouncedValue(inputValue, DEBOUNCE_MS);
  const trimmedQuery = debouncedQuery.trim();

  // Reset the highlight to the top whenever the debounced query changes.
  const [prevQuery, setPrevQuery] = useState(trimmedQuery);
  if (prevQuery !== trimmedQuery) {
    setPrevQuery(trimmedQuery);
    setHighlightedIndex(0);
  }

  const search = useMedicineSearch(
    trimmedQuery,
    open && trimmedQuery.length >= MIN_QUERY_LENGTH,
  );

  // Single source of truth for the flat, keyboard-navigable order: generic
  // matches first, then brand matches (preserving backend score order within
  // each section).
  const orderedResults = useMemo(() => {
    const { generic, brand, combination } = partitionBySection(
      search.data?.results ?? [],
    );
    return [...generic, ...brand, ...combination];
  }, [search.data]);

  // Clamp the highlight into range (guards against shrinking result sets).
  const clampedHighlight =
    orderedResults.length === 0
      ? 0
      : Math.min(highlightedIndex, orderedResults.length - 1);

  // Close on outside click (lifted from the old DrugLineRow pattern). The
  // setState here lives in an event-handler callback, not the effect body.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  function handleSelect(medicine: MedicineSearchResult) {
    onChange(medicine);
    setInputValue(medicine.generic_name);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (orderedResults.length > 0) {
          setHighlightedIndex(
            (clampedHighlight + 1) % orderedResults.length,
          );
        }
        break;
      }
      case "ArrowUp": {
        e.preventDefault();
        if (!open) {
          setOpen(true);
          return;
        }
        if (orderedResults.length > 0) {
          setHighlightedIndex(
            (clampedHighlight - 1 + orderedResults.length) %
              orderedResults.length,
          );
        }
        break;
      }
      case "Enter": {
        if (open && orderedResults[clampedHighlight]) {
          e.preventDefault();
          handleSelect(orderedResults[clampedHighlight]);
        }
        break;
      }
      case "Escape": {
        if (open) {
          e.preventDefault();
          setOpen(false);
        }
        break;
      }
      default:
        break;
    }
  }

  const showDropdown =
    open && (search.isFetching || trimmedQuery.length >= MIN_QUERY_LENGTH);
  const activeDescendant =
    open && orderedResults[clampedHighlight]
      ? `medicine-option-${clampedHighlight}`
      : undefined;

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <MedicineSearchInput
        id={id}
        value={inputValue}
        onValueChange={(v) => {
          setInputValue(v);
          setOpen(true);
          setHighlightedIndex(0);
        }}
        loading={search.isFetching && trimmedQuery.length >= MIN_QUERY_LENGTH}
        placeholder={placeholder}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-activedescendant={activeDescendant}
        onFocus={() => {
          if (trimmedQuery.length >= MIN_QUERY_LENGTH) {
            setOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
      />

      {showDropdown ? (
        <MedicineDropdown
          id={listboxId}
          results={orderedResults}
          loading={search.isFetching}
          query={trimmedQuery}
          highlightedIndex={clampedHighlight}
          selectedRxcui={value?.rxcui}
          onSelect={handleSelect}
          onHover={setHighlightedIndex}
        />
      ) : null}
    </div>
  );
}
