/**
 * React Query hooks for the Medicine reference-data flow.
 *
 * Mirrors [`usePrescriptions.ts`](src/hooks/usePrescriptions.ts): a namespaced
 * query-key factory, a search query gated on a minimum query length with a short
 * `staleTime`, a detail query, and favorites mutations that invalidate the
 * favorites cache slice and surface `sonner` toasts.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  addFavoriteMedicine,
  getMedicine,
  listFavoriteMedicines,
  removeFavoriteMedicine,
  searchMedicines,
} from "@/lib/medicine-api";
/** Root namespace + helpers for all medicine query keys. */
export const medicineKeys = {
  all: ["medicines"] as const,
  search: (q: string) => [...medicineKeys.all, "search", q] as const,
  detail: (rxcui: string) => [...medicineKeys.all, "detail", rxcui] as const,
  /** Favorites are doctor-scoped (resolved from the JWT on the backend). */
  favorites: () => [...medicineKeys.all, "favorites"] as const,
};

/** Minimum query length before the search query is enabled. */
const MIN_QUERY_LENGTH = 2;

/**
 * Local medicine-index search.
 *
 * Debouncing is owned by the calling component (the combobox); this hook is only
 * enabled when a query of at least {@link MIN_QUERY_LENGTH} characters is
 * supplied. A 60s `staleTime` keeps repeated keystrokes responsive without
 * re-hitting the backend.
 */
export function useMedicineSearch(query: string, enabled?: boolean) {
  const q = query.trim();
  return useQuery({
    queryKey: medicineKeys.search(q),
    queryFn: () => searchMedicines(q),
    enabled: enabled ?? q.length >= MIN_QUERY_LENGTH,
    staleTime: 60_000,
  });
}

/**
 * Fetch the full normalized detail for a single medicine by RxCUI.
 *
 * Disabled until `rxcui` is provided (or `enabled` is false).
 */
export function useMedicineDetail(rxcui: string | null | undefined, enabled?: boolean) {
  return useQuery({
    queryKey: medicineKeys.detail(rxcui ?? ""),
    queryFn: () => getMedicine(rxcui as string),
    enabled: enabled ?? Boolean(rxcui),
    staleTime: 60_000,
  });
}

/**
 * List the current doctor's favorited medicines (doctor resolved from the JWT on
 * the backend).
 */
export function useFavoriteMedicines() {
  return useQuery({
    queryKey: medicineKeys.favorites(),
    queryFn: () => listFavoriteMedicines(),
    staleTime: 30_000,
  });
}

/**
 * Add a medicine to the current doctor's favorites. Invalidates the favorites
 * list on success and toasts success/failure.
 */
export function useAddFavoriteMedicine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rxcui: string) => addFavoriteMedicine(rxcui),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: medicineKeys.favorites() });
      toast.success("به داروهای منتخب افزوده شد");
    },
    onError: (err: unknown) => {
      toast.error("افزودن به داروهای منتخب ناموفق بود.", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
}

/**
 * Remove a medicine from the current doctor's favorites. Invalidates the
 * favorites list on success and toasts success/failure.
 */
export function useRemoveFavoriteMedicine() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (rxcui: string) => removeFavoriteMedicine(rxcui),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: medicineKeys.favorites() });
      toast.success("از داروهای منتخب حذف شد");
    },
    onError: (err: unknown) => {
      toast.error("حذف از داروهای منتخب ناموفق بود.", {
        description: err instanceof Error ? err.message : undefined,
      });
    },
  });
}

/**
 * Convenience helper to render a small "⭐ toggle favorite" affordance. It checks
 * the current favorites list and routes to the add/remove mutation accordingly.
 * Returns the handlers + pending state for a single rxcui.
 */
export function useToggleFavorite() {
  const favorites = useFavoriteMedicines();
  const addFav = useAddFavoriteMedicine();
  const removeFav = useRemoveFavoriteMedicine();

  function isFavorite(rxcui: string): boolean {
    return (favorites.data ?? []).some((f) => f.rxcui === rxcui);
  }

  function toggle(rxcui: string) {
    if (isFavorite(rxcui)) {
      removeFav.mutate(rxcui);
    } else {
      addFav.mutate(rxcui);
    }
  }

  return {
    isFavorite,
    toggle,
    isPending: addFav.isPending || removeFav.isPending,
  };
}

