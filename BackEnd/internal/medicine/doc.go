// Package medicine implements the Medicine reference-data domain: a locally
// indexed, fuzzy-ranked drug search service that removes the clinic's hard
// runtime dependency on the external RxNorm (NLM) REST API.
//
// It is the first internal domain deliberately split into sub-packages rather
// than the project's usual flat three-file layout. The four substantially
// different, independently testable concerns it bundles — an outbound RxNorm
// HTTP client, a fuzzy search engine, a cache, and text normalization — justify
// the deviation, mirroring how pkg/database already separates connectivity from
// data access. This deviation is documented and bounded to this single domain
// (see plans/medicine-search-refactor.md §2.2).
//
// # Sub-package layout
//
//   - model       — the Medicine entity (bson+json) and the API DTOs.
//   - normalizer  — pure text normalization, Persian↔Latin transliteration,
//     tokenization and RxNorm description parsing.
//   - rxnorm      — the bounded, context-aware RxNorm REST client (search,
//     approximate match, seed fetch) behind a Client interface.
//   - cache       — the TTL+LRU cache abstraction (Cache interface) with an
//     in-memory implementation and a nil-safe NoOpCache.
//   - repository  — the MongoDB data-access layer: indexes, prefix/$text search,
//     rxcui lookup, idempotent bulk upsert and per-doctor favorites.
//   - search      — the stateless 5-level priority search engine (exact → prefix
//     → fuzzy → brand → synonym) with a backend Levenshtein rerank.
//
// # Dependency direction
//
// All arrows point inward toward model and pkg:
//
//	search → repository, normalizer, model
//	repository → model, pkg/database, pkg/logger
//	cache → (stdlib only)
//	rxnorm → pkg/logger
//	normalizer → (stdlib only)
//
// The service and handler sub-packages (the HTTP-facing orchestration layer) and
// the bootstrap wiring are intentionally NOT part of this task; they are added by
// a follow-up task as documented in the architecture plan's implementation order.
//
// Per the project's Clean Architecture rules every sub-package here lives in
// internal/ and may import pkg/, while pkg/ must never import internal/.
package medicine
