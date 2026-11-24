/**
 * Medicine reference-data domain types (CLINICAL model).
 *
 * These interfaces mirror the Go DTOs in
 * [`BackEnd/internal/medicine/model/model.go`](../../BackEnd/internal/medicine/model/model.go)
 * so the frontend types line up with what the API returns. Field names are kept
 * snake_case to match the JSON payload exactly (no client-side transform),
 * mirroring how [`types/prescription.ts`](src/types/prescription.ts) aligns with
 * its backend DTOs.
 *
 * The clinical model decouples the stored concept from the raw RxNorm
 * description: `generic_name` is a clean name (e.g. `"Ibuprofen"`), combinations
 * are first-class (`ingredients`, `is_combination`), and every result carries a
 * `category` (generic / brand / combination) the UI groups and ranks by. Raw
 * RxNorm description strings never reach the client.
 */

/**
 * Clinical category used for ranking and UI grouping. Mirrors
 * `model.Category`:
 * - `generic` — a generic clinical drug (RxNorm SCD/IN).
 * - `brand` — a branded clinical drug (RxNorm SBD).
 * - `combination` — a multi-ingredient drug (ranked lowest).
 */
export type Category = "generic" | "brand" | "combination";

/**
 * How a single medicine result matched the user's query. Mirrors the
 * `model.MatchType` typed-string enum on the backend. The values are the JSON
 * wire tokens.
 *
 * - `exact_generic` — normalized generic name equals the normalized query.
 * - `prefix_generic` — normalized generic name starts with the query.
 * - `exact_brand` — a brand name equals the query.
 * - `prefix_brand` — a brand name starts with the query.
 * - `fuzzy` — small edit-distance match (tolerated typo).
 * - `synonym` — a synonym (incl. Persian/transliterated) matched.
 * - `combination` — a multi-ingredient drug matched (always demoted).
 */
export type MatchType =
  | "exact_generic"
  | "prefix_generic"
  | "exact_brand"
  | "prefix_brand"
  | "fuzzy"
  | "synonym"
  | "combination";

/**
 * A single active ingredient of a medicine. Mirrors `model.Ingredient`.
 * Combination drugs carry more than one; single-ingredient drugs carry one.
 */
export interface Ingredient {
  /** Canonical ingredient name, e.g. `"Ibuprofen"`. */
  name: string;
  /** Per-ingredient strength with unit, e.g. `"800 mg"`. */
  strength?: string;
  /** Parsed unit, e.g. `"mg"`. */
  unit?: string;
}

/**
 * A single ranked search hit. Carries the clean clinical display fields plus the
 * {@link Category}/{@link MatchType}/score assigned by the backend search engine
 * so the frontend can group by category and badge results by relevance tier.
 * Mirrors `model.MedicineSearchResult`.
 */
export interface MedicineSearchResult {
  /** Display RxNorm CUI of the logical medicine (primary concept). */
  rxcui: string;
  /**
   * Additional RxCUIs that resolve to the SAME logical medicine (same
   * generic+strength+form+route+category). Never null.
   */
  related_rxcuis: string[];
  /** Clean canonical name, e.g. `"Ibuprofen"` or `"Famotidine + Ibuprofen"`. */
  generic_name: string;
  /** Primary trade name for a branded product; omitted for generics. */
  brand_name?: string;
  /** All known trade names. Never null. */
  brand_names: string[];
  /** Clean display strength, e.g. `"400 mg"`. */
  strength?: string;
  /** Dosage form, e.g. `"Tablet"`. */
  form?: string;
  /** Administration route, e.g. `"Oral"`. */
  route?: string;
  /** Clinical classification (generic/brand/combination). */
  category: Category;
  /** Whether this is a multi-ingredient drug. */
  is_combination: boolean;
  /** Highest-priority tier the result qualified for. */
  match_type: MatchType;
  /** Relevance score (higher is better). */
  score: number;
}

/**
 * Full-document detail returned by the detail endpoint. Mirrors
 * `model.MedicineDetail`. Exposes the structured clinical view (ingredients,
 * category, strengths) without any raw RxNorm description.
 */
export interface MedicineDetail {
  /** RxNorm Concept Unique Identifier. */
  rxcui: string;
  /** Clean canonical name. */
  generic_name: string;
  /** Primary trade name for a branded product; omitted for generics. */
  brand_name?: string;
  /** Trade names. Never null. */
  brand_names: string[];
  /** Alternate names incl. Persian/transliterated forms. Never null. */
  synonyms: string[];
  /** Active ingredient(s) with their strengths. Never null. */
  ingredients: Ingredient[];
  /** Clean display strength. */
  strength?: string;
  /** Dosage form, e.g. `"Tablet"`. */
  dosage_form?: string;
  /** Administration route. */
  route?: string;
  /** RxNorm term type. */
  tty?: string;
  /** Clinical classification. */
  category: Category;
  /** Whether this is a multi-ingredient drug. */
  is_combination: boolean;
}

/**
 * Pre-grouped search results by clinical category. Mirrors
 * `model.MedicineResultGroups` — the backend groups so the frontend only
 * renders.
 */
export interface MedicineResultGroups {
  generic: MedicineSearchResult[];
  brand: MedicineSearchResult[];
  combination: MedicineSearchResult[];
}

/**
 * Payload returned by the medicine search endpoint. Mirrors
 * `model.SearchResponse`. Echoes the query, the ranked+deduplicated results
 * (flat), the pre-grouped view, the total count and whether the answer was
 * served from the cache.
 */
export interface MedicineSearchResponse {
  /** The (trimmed) search term that produced the results. */
  query: string;
  /** Ranked, de-duplicated list of logical medicines. Never null. */
  results: MedicineSearchResult[];
  /** Same results pre-grouped by clinical category. */
  groups: MedicineResultGroups;
  /** Number of results in {@link results}. */
  total: number;
  /** Whether the response was served from the backend cache. */
  served_from_cache: boolean;
}

/**
 * A doctor's favorited drug shortcut. Mirrors the client-relevant subset of
 * `model.FavoriteMedicineResponse` (the doctor identity is resolved from the JWT
 * server-side, so it is not needed client-side). Used by the favorites quick-add
 * row above the medicine combobox.
 */
export interface FavoriteMedicine {
  /** RxNorm CUI of the favorited drug. */
  rxcui: string;
  /** ISO 8601 timestamp the favorite was created (drives most-recent-first). */
  created_at: string;
}

/** Request body for `POST /v1/medicines/favorites`. */
export interface AddFavoriteMedicineRequest {
  rxcui: string;
}
