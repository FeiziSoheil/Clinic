"use client";

/**
 * RecentMedicines — recently-selected medicines stored in localStorage (spec §12).
 *
 * A horizontal chip row of the most-recently selected medicines. Selections are
 * pushed via {@link pushRecentMedicine} (capped at 10, newest-first, de-duplicated
 * by `rxcui`); clicking a chip re-selects it.
 *
 * State is local-only (localStorage) and SSR-safe. It is subscribed with
 * {@link useSyncExternalStore} (the React-blessed primitive for external mutable
 * sources): a custom same-tab event plus the native cross-tab `storage` event
 * keep every consumer in sync without `setState`-in-`useEffect`.
 */

import { useMemo, useSyncExternalStore } from "react";
import { Clock, Pill } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MedicineSearchResult } from "@/types/medicine";

const STORAGE_KEY = "clinick.recent-medicines";
const MAX_RECENTS = 10;
/** Custom event dispatched alongside the native `storage` event for same-tab sync. */
const CHANGE_EVENT = "clinick:recent-medicines-change";

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

/** Parse the raw localStorage string into a validated recents list. */
function parseRecents(raw: string): MedicineSearchResult[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is MedicineSearchResult =>
        !!x &&
        typeof x === "object" &&
        typeof (x as MedicineSearchResult).rxcui === "string" &&
        typeof (x as MedicineSearchResult).generic_name === "string",
    );
  } catch {
    return [];
  }
}

/** Read+parse the current recents list (browser-only; `[]` on the server). */
function readRecents(): MedicineSearchResult[] {
  if (!isBrowser()) return [];
  return parseRecents(window.localStorage.getItem(STORAGE_KEY) ?? "");
}

function writeRecents(list: MedicineSearchResult[]): void {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    /* ignore quota / serialization errors */
  }
}

/**
 * Push a medicine to the top of the recents list (de-duplicated by `rxcui`,
 * capped at {@link MAX_RECENTS}). Call this when a medicine is selected.
 */
export function pushRecentMedicine(medicine: MedicineSearchResult): void {
  const next = [
    medicine,
    ...readRecents().filter((x) => x.rxcui !== medicine.rxcui),
  ].slice(0, MAX_RECENTS);
  writeRecents(next);
}

/** Clear the recents list. */
export function clearRecents(): void {
  writeRecents([]);
}

/* ----------------------------- external store ----------------------------- */

function subscribe(callback: () => void): () => void {
  if (!isBrowser()) return () => {};
  window.addEventListener(CHANGE_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(CHANGE_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

/** Stable snapshot (the raw string) so `useSyncExternalStore` won't loop. */
function getSnapshot(): string {
  if (!isBrowser()) return "";
  return window.localStorage.getItem(STORAGE_KEY) ?? "";
}

/** Server snapshot: empty list (avoids hydration mismatch). */
function getServerSnapshot(): string {
  return "";
}

/**
 * Subscribe to the recents list. SSR-safe (returns `[]` until mounted) and kept
 * in sync across hook instances/tabs via the custom + storage events.
 */
export function useRecentMedicines(): {
  recents: MedicineSearchResult[];
  remove: (rxcui: string) => void;
  clear: () => void;
} {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const recents = useMemo(() => parseRecents(raw), [raw]);

  return {
    recents,
    remove: (rxcui: string) =>
      writeRecents(recents.filter((x) => x.rxcui !== rxcui)),
    clear: clearRecents,
  };
}

/* -------------------------------- component ------------------------------- */

export interface RecentMedicinesProps {
  /** Emitted when a recent chip is clicked. */
  onSelect: (medicine: MedicineSearchResult) => void;
  /** Render nothing when the list is empty (default `true`). */
  emptyHidden?: boolean;
  className?: string;
}

export function RecentMedicines({
  onSelect,
  emptyHidden = true,
  className,
}: RecentMedicinesProps) {
  const { recents } = useRecentMedicines();

  if (recents.length === 0) {
    return emptyHidden ? null : (
      <p className="text-xs text-muted-foreground">داروی اخیری انتخاب نشده است.</p>
    );
  }

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        <span>داروهای اخیر</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {recents.map((m) => (
          <button
            key={m.rxcui}
            type="button"
            onClick={() => onSelect(m)}
            className="inline-flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <Pill className="size-3.5 text-muted-foreground" />
            <span className="font-medium">{m.generic_name}</span>
            {m.brand_names[0] ? (
              <span className="text-muted-foreground">· {m.brand_names[0]}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
