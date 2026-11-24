/**
 * Medicine reference-data API client for the doctor portal (CLINICAL model).
 *
 * Mirrors the `USE_MOCK` + `delay()` pattern of
 * [`prescription-api.ts`](src/lib/prescription-api.ts). Every function resolves
 * against the live backend by default; flip {@link USE_MOCK} to `true` to
 * exercise the synthetic data branches without a running backend.
 *
 * Real endpoints (doctor-only, JWT handled by the shared {@link apiClient}):
 * - `GET  /v1/medicines/search?q=<q>&limit=<n>`
 * - `GET  /v1/medicines/:rxcui`
 * - `GET  /v1/medicines/favorites`
 * - `POST /v1/medicines/favorites`  body `{ rxcui }`
 * - `DELETE /v1/medicines/favorites/:rxcui`
 */

import { apiClient } from "./api";
import type {
  AddFavoriteMedicineRequest,
  Category,
  FavoriteMedicine,
  Ingredient,
  MedicineDetail,
  MedicineResultGroups,
  MedicineSearchResponse,
  MedicineSearchResult,
  MatchType,
} from "@/types/medicine";

/**
 * Master switch for the mock layer. Defaults to `false` so the real endpoints
 * are used; flip to `true` to exercise the synthetic branches offline (keeps the
 * dropdown demoable without the Golang backend).
 */
export const USE_MOCK = false;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/*  Mock corpus (clinical shape)                                              */
/* -------------------------------------------------------------------------- */

/** Minimal mock medicine document in the clinical local-index shape. */
interface MockMedicine {
  rxcui: string;
  generic_name: string;
  brand_name?: string;
  brand_names: string[];
  synonyms: string[];
  ingredients: Ingredient[];
  strength?: string; // single-ingredient display strength; "" for combinations
  dosage_form?: string;
  route?: string;
  tty: string;
  category: Category;
  is_combination: boolean;
}

/**
 * A small, realistic reference set mirroring the clinical pipeline output. It
 * includes DUPLICATE RxCUIs for the same clinical medicine (two Sulfasalazine
 * entries) so the dedup pass is demoable, Ibuprofen at several strengths for the
 * ascending-strength ordering, branded products, and a combination drug.
 */
const MOCK_MEDICINES: MockMedicine[] = [
  ibu("197805", "200 mg"),
  ibu("197807", "400 mg"),
  ibu("197808", "600 mg"),
  ibu("197809", "800 mg"),
  // Branded Ibuprofen products.
  {
    rxcui: "153010",
    generic_name: "Ibuprofen",
    brand_name: "Advil",
    brand_names: ["Advil"],
    synonyms: ["ایبوپروفن"],
    ingredients: [{ name: "Ibuprofen", strength: "200", unit: "MG" }],
    strength: "200 mg",
    dosage_form: "Tablet",
    route: "Oral",
    tty: "SBD",
    category: "brand",
    is_combination: false,
  },
  {
    rxcui: "858328",
    generic_name: "Ibuprofen",
    brand_name: "Motrin",
    brand_names: ["Motrin"],
    synonyms: ["ایبوپروفن"],
    ingredients: [{ name: "Ibuprofen", strength: "200", unit: "MG" }],
    strength: "200 mg",
    dosage_form: "Tablet",
    route: "Oral",
    tty: "SBD",
    category: "brand",
    is_combination: false,
  },
  // Combination (Duexis) — ranked lowest.
  {
    rxcui: "801145",
    generic_name: "Famotidine + Ibuprofen",
    brand_name: "Duexis",
    brand_names: ["Duexis"],
    synonyms: [],
    ingredients: [
      { name: "Famotidine", strength: "26.6", unit: "MG" },
      { name: "Ibuprofen", strength: "800", unit: "MG" },
    ],
    strength: "",
    dosage_form: "Tablet",
    route: "Oral",
    tty: "SBD",
    category: "combination",
    is_combination: true,
  },
  // Sulfasalazine generics — TWO RxCUIs for the SAME clinical medicine (dedup).
  {
    rxcui: "198232",
    generic_name: "Sulfasalazine",
    brand_names: [],
    synonyms: ["سولفاسالازین"],
    ingredients: [{ name: "Sulfasalazine", strength: "500", unit: "MG" }],
    strength: "500 mg",
    dosage_form: "Tablet",
    route: "Oral",
    tty: "SCD",
    category: "generic",
    is_combination: false,
  },
  {
    rxcui: "313142",
    generic_name: "Sulfasalazine",
    brand_name: "Azulfidine",
    brand_names: ["Azulfidine"],
    synonyms: [],
    ingredients: [{ name: "Sulfasalazine", strength: "500", unit: "MG" }],
    strength: "500 mg",
    dosage_form: "Tablet",
    route: "Oral",
    tty: "SBD",
    category: "generic",
    is_combination: false,
  },
  {
    rxcui: "161",
    generic_name: "Acetaminophen",
    brand_names: ["Tylenol", "Panadol"],
    synonyms: ["paracetamol", "APAP", "پاراسیتامول", "استامینوفن"],
    ingredients: [{ name: "Acetaminophen", strength: "500", unit: "MG" }],
    strength: "500 mg",
    dosage_form: "Tablet",
    route: "Oral",
    tty: "IN",
    category: "generic",
    is_combination: false,
  },
  {
    rxcui: "723",
    generic_name: "Amoxicillin",
    brand_names: ["Amoxil", "Moxatag"],
    synonyms: ["amoxycillin", "آموکسی‌سیلین"],
    ingredients: [{ name: "Amoxicillin", strength: "250", unit: "MG" }],
    strength: "250 mg / 5 ml",
    dosage_form: "Suspension",
    route: "Oral",
    tty: "IN",
    category: "generic",
    is_combination: false,
  },
];

/** Helper: build an Ibuprofen generic (SCD) at a given display strength. */
function ibu(rxcui: string, strength: string): MockMedicine {
  const value = strength.split(" ")[0] ?? strength;
  return {
    rxcui,
    generic_name: "Ibuprofen",
    brand_names: [],
    synonyms: ["ایبوپروفن"],
    ingredients: [{ name: "Ibuprofen", strength: value, unit: "MG" }],
    strength,
    dosage_form: "Tablet",
    route: "Oral",
    tty: "SCD",
    category: "generic",
    is_combination: false,
  };
}

/** In-memory favorite set for the mock branch (rxcui -> created_at). */
const MOCK_FAVORITES = new Map<string, string>();

/** Lowercase + trim normalization used by the mock search engine. */
function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Category sort rank: generic(0) < brand(1) < combination(2). */
function categoryRank(c: Category): number {
  switch (c) {
    case "generic":
      return 0;
    case "brand":
      return 1;
    case "combination":
      return 2;
  }
}

/** Leading numeric magnitude of a strength string ("200 mg" -> 200). */
function strengthMagnitude(s?: string): number {
  if (!s) return 0;
  const m = s.match(/[0-9]+(\.[0-9]+)?/);
  return m ? Number(m[0]) : 0;
}

/** Classic Levenshtein edit distance. */
function editDistance(a: string, b: string): number {
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0),
  );
  for (let i = 0; i <= a.length; i++) dp[i][0] = i;
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

interface Scored {
  medicine: MockMedicine;
  match_type: MatchType;
  score: number;
}

/**
 * Mock implementation of the backend weighted clinical search engine
 * (exact_generic 100, prefix_generic 95, exact_brand 90, prefix_brand 80, fuzzy
 * 75, synonym 70, combination 30). Combinations are always demoted. Mirrors the
 * Golang search.Rank including the dedup + grouping passes.
 */
function mockSearch(rawQuery: string, limit: number): MedicineSearchResponse {
  const q = norm(rawQuery);
  if (!q) {
    return emptyResponse(rawQuery.trim());
  }

  const scored: Scored[] = MOCK_MEDICINES.map((m): Scored | null => {
    if (m.is_combination) {
      return combinationMatches(q, m)
        ? { medicine: m, match_type: "combination", score: 30 }
        : null;
    }
    const generic = norm(m.generic_name);
    if (generic === q) return { medicine: m, match_type: "exact_generic", score: 100 };
    if (generic.startsWith(q)) return { medicine: m, match_type: "prefix_generic", score: 95 };
    if (brandExact(q, m)) return { medicine: m, match_type: "exact_brand", score: 90 };
    if (brandPrefix(q, m)) return { medicine: m, match_type: "prefix_brand", score: 80 };
    if (generic.length > 3 && editDistance(q, generic) <= 2) {
      return { medicine: m, match_type: "fuzzy", score: 75 };
    }
    if (synonymMatches(q, m)) return { medicine: m, match_type: "synonym", score: 70 };
    return null;
  }).filter((x): x is Scored => x !== null);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const ca = categoryRank(a.medicine.category);
    const cb = categoryRank(b.medicine.category);
    if (ca !== cb) return ca - cb;
    const sa = strengthMagnitude(a.medicine.strength);
    const sb = strengthMagnitude(b.medicine.strength);
    if (sa !== sb) return sa - sb;
    return a.medicine.generic_name.localeCompare(b.medicine.generic_name);
  });

  const deduped = dedupByClinicalKey(scored).slice(0, Math.max(1, limit));
  const results: MedicineSearchResult[] = deduped.map(toResultDto);

  return {
    query: rawQuery.trim(),
    results,
    groups: groupByCategory(results),
    total: results.length,
    served_from_cache: false,
  };
}

/** Whether the query exactly equals a brand name. */
function brandExact(q: string, m: MockMedicine): boolean {
  if (m.brand_name && norm(m.brand_name) === q) return true;
  return m.brand_names.some((b) => norm(b) === q);
}

/** Whether a brand name starts with (but is not equal to) the query. */
function brandPrefix(q: string, m: MockMedicine): boolean {
  const test = (b: string) => {
    const nb = norm(b);
    return nb !== q && nb.startsWith(q);
  };
  if (m.brand_name && test(m.brand_name)) return true;
  return m.brand_names.some(test);
}

/** Whether the query matches any synonym (exact or prefix). */
function synonymMatches(q: string, m: MockMedicine): boolean {
  return m.synonyms.some((s) => {
    const ns = norm(s);
    return ns === q || ns.startsWith(q);
  });
}

/** Whether a combination drug is relevant to the query at all. */
function combinationMatches(q: string, m: MockMedicine): boolean {
  if (norm(m.generic_name).includes(q)) return true;
  if (m.ingredients.some((ing) => norm(ing.name).includes(q))) return true;
  return brandExact(q, m) || brandPrefix(q, m) || synonymMatches(q, m);
}

/** Deduplication key: generic+strength+form+route+category. */
function clinicalKey(m: MockMedicine): string {
  return [norm(m.generic_name), m.strength ?? "", m.dosage_form ?? "", m.route ?? "", m.category].join("|");
}

/**
 * Merge scored medicines sharing the same clinical identity into one logical
 * entry, unioning brand names and related RxCUIs — mirrors the backend pass.
 */
function dedupByClinicalKey(scored: Scored[]): Scored[] {
  const order: string[] = [];
  const buckets = new Map<
    string,
    { display: Scored; related: Set<string>; brands: Set<string> }
  >();
  for (const s of scored) {
    const k = clinicalKey(s.medicine);
    const b = buckets.get(k);
    if (!b) {
      const brands = new Set<string>(s.medicine.brand_names);
      if (s.medicine.brand_name) brands.add(s.medicine.brand_name);
      buckets.set(k, { display: s, related: new Set([s.medicine.rxcui]), brands });
      order.push(k);
    } else {
      b.related.add(s.medicine.rxcui);
      for (const br of s.medicine.brand_names) b.brands.add(br);
      if (s.medicine.brand_name) b.brands.add(s.medicine.brand_name);
    }
  }
  return order.map((k) => {
    const b = buckets.get(k)!;
    return {
      ...b.display,
      medicine: {
        ...b.display.medicine,
        brand_names: Array.from(b.brands).sort(),
      },
    };
  });
}

/** Map a scored mock medicine to the public search-result DTO. */
function toResultDto(s: Scored): MedicineSearchResult {
  const m = s.medicine;
  return {
    rxcui: m.rxcui,
    related_rxcuis: [m.rxcui], // (mock dedup keeps a single rxcui per key)
    generic_name: m.generic_name,
    brand_name: m.brand_name,
    brand_names: m.brand_names,
    strength: m.strength,
    form: m.dosage_form,
    route: m.route,
    category: m.category,
    is_combination: m.is_combination,
    match_type: s.match_type,
    score: s.score,
  };
}

/** Partition ranked results into the generic/brand/combination sections. */
function groupByCategory(results: MedicineSearchResult[]): MedicineResultGroups {
  const groups: MedicineResultGroups = { generic: [], brand: [], combination: [] };
  for (const r of results) {
    groups[r.category].push(r);
  }
  return groups;
}

/** Build an empty (but well-formed) response. */
function emptyResponse(query: string): MedicineSearchResponse {
  return { query, results: [], groups: { generic: [], brand: [], combination: [] }, total: 0, served_from_cache: false };
}

/* -------------------------------------------------------------------------- */
/*  Public API                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Search the local medicine index.
 *
 * Real endpoint: `GET /v1/medicines/search?q=<q>&limit=<n>`.
 */
export async function searchMedicines(
  q: string,
  limit = 20,
): Promise<MedicineSearchResponse> {
  if (USE_MOCK) {
    await delay(280);
    return mockSearch(q, limit);
  }

  const res = await apiClient.get<MedicineSearchResponse>(
    "/v1/medicines/search",
    { params: { q, limit } },
  );
  return res.data;
}

/**
 * Fetch the full normalized detail for a single medicine by RxCUI.
 *
 * Real endpoint: `GET /v1/medicines/:rxcui`.
 */
export async function getMedicine(rxcui: string): Promise<MedicineDetail> {
  if (USE_MOCK) {
    await delay(250);
    const m = MOCK_MEDICINES.find((x) => x.rxcui === rxcui);
    if (!m) {
      throw new Error(`medicine ${rxcui} not found`);
    }
    return {
      rxcui: m.rxcui,
      generic_name: m.generic_name,
      brand_name: m.brand_name,
      brand_names: m.brand_names,
      synonyms: m.synonyms,
      ingredients: m.ingredients,
      strength: m.strength,
      dosage_form: m.dosage_form,
      route: m.route,
      tty: m.tty,
      category: m.category,
      is_combination: m.is_combination,
    };
  }

  const res = await apiClient.get<MedicineDetail>(`/v1/medicines/${rxcui}`);
  return res.data;
}

/**
 * List the current doctor's favorited medicines (doctor resolved from the JWT on
 * the backend).
 *
 * Real endpoint: `GET /v1/medicines/favorites`.
 */
export async function listFavoriteMedicines(): Promise<FavoriteMedicine[]> {
  if (USE_MOCK) {
    await delay(220);
    return Array.from(MOCK_FAVORITES.entries())
      .map(([rxcui, created_at]) => ({ rxcui, created_at }))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const res = await apiClient.get<FavoriteMedicine[]>("/v1/medicines/favorites");
  return res.data;
}

/**
 * Add a medicine to the current doctor's favorites.
 *
 * Real endpoint: `POST /v1/medicines/favorites` body `{ rxcui }` → 201.
 */
export async function addFavoriteMedicine(rxcui: string): Promise<void> {
  if (USE_MOCK) {
    await delay(200);
    if (!MOCK_FAVORITES.has(rxcui)) {
      MOCK_FAVORITES.set(rxcui, new Date().toISOString());
    }
    return;
  }

  const body: AddFavoriteMedicineRequest = { rxcui };
  await apiClient.post("/v1/medicines/favorites", body);
}

/**
 * Remove a medicine from the current doctor's favorites.
 *
 * Real endpoint: `DELETE /v1/medicines/favorites/:rxcui` → 204.
 */
export async function removeFavoriteMedicine(rxcui: string): Promise<void> {
  if (USE_MOCK) {
    await delay(200);
    MOCK_FAVORITES.delete(rxcui);
    return;
  }

  await apiClient.delete(`/v1/medicines/favorites/${rxcui}`);
}

/**
 * Project a {@link MedicineDetail} into a {@link MedicineSearchResult} so a
 * favorite can be re-selected without an extra round-trip. `match_type` /
 * `score` are synthetic (the favorite is a deliberate shortcut, not a search
 * hit) and only used to satisfy the result shape.
 */
export function detailToSearchResult(d: MedicineDetail): MedicineSearchResult {
  return {
    rxcui: d.rxcui,
    related_rxcuis: [d.rxcui],
    generic_name: d.generic_name,
    brand_name: d.brand_name,
    brand_names: d.brand_names,
    strength: d.strength,
    form: d.dosage_form,
    route: d.route,
    category: d.category,
    is_combination: d.is_combination,
    match_type: "exact_generic",
    score: 0,
  };
}
