// Package rxnorm implements a small, bounded HTTP client over the public RxNorm
// (NLM) REST API.
//
// It is the extraction and generalization of the RxNorm call logic that
// originally lived inline in the Prescription domain's drug-search handler.
// Pulling it into its own package gives the Medicine domain a single, reusable,
// context-aware client with structured logging and a configurable timeout, and
// keeps the direct HTTP dependency out of the Prescription domain — which now
// performs no drug search at all; search is owned exclusively by Medicine.
//
// The package exposes a Client interface so the Medicine service depends on an
// abstraction (trivially faked in tests) rather than a concrete HTTP client.
//
// Per the project's Clean Architecture rules this package lives in `internal/`
// and imports only the standard library and the project logger; it intentionally
// does NOT import the medicine model package so it can be reused independently
// and tested without dragging the domain types along.
package rxnorm

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"clinic-api/pkg/logger"
)

// ----------------------------------------------------------------------------
// Public types
// ----------------------------------------------------------------------------

// RxNormConcept mirrors a single concept surfaced by the various RxNorm REST
// endpoints. All endpoints are flattened onto this common shape so the Medicine
// service can consume drug-name search, approximate-term matches and seed
// concepts through one struct.
type RxNormConcept struct {
	// RxCUI is the RxNorm Concept Unique Identifier.
	RxCUI string `json:"rxcui"`
	// Name is the canonical drug name as returned by RxNorm.
	Name string `json:"name"`
	// Synonym is an alternate name for the drug, when the endpoint surfaces one.
	Synonym string `json:"synonym"`
	// TTY is the RxNorm term type, e.g. "IN" (ingredient), "SCD" (clinical drug).
	TTY string `json:"tty"`
}

// Client is the abstraction over the RxNorm REST API the Medicine domain depends
// on. Declaring it as an interface keeps the service testable with a fake client
// and lets a future offline/cached implementation drop in without touching the
// service.
type Client interface {
	// SearchByName performs the /drugs.json?name= lookup, the classic drug-name
	// search. It returns the de-duplicated (by RxCUI) concepts in RxNorm order.
	SearchByName(ctx context.Context, name string) ([]RxNormConcept, error)
	// GetApproximateMatch performs the /approximateTerm.json?term= lookup, used
	// for fuzzy/typo-tolerant matches. It returns the ranked candidate concepts.
	GetApproximateMatch(ctx context.Context, term string) ([]RxNormConcept, error)
	// FetchSeedConcepts pulls the prescribable concept set (IN/SCD/SBD) used to
	// build or refresh the local medicine index.
	FetchSeedConcepts(ctx context.Context) ([]RxNormConcept, error)
}

// ----------------------------------------------------------------------------
// Constructor
// ----------------------------------------------------------------------------

// defaultBaseURL is the public RxNorm REST root used when no override is supplied.
const defaultBaseURL = "https://rxnav.nlm.nih.gov/REST"

// defaultTimeout bounds every outbound RxNorm request so a slow/hung upstream
// cannot stall an API request indefinitely (mirrors prescription's 10s client).
const defaultTimeout = 10 * time.Second

// httpClient is the concrete Client implementation over the public RxNorm REST
// API. It owns a dedicated *http.Client with a bounded timeout.
type httpClient struct {
	base   string
	client *http.Client
}

// New constructs a Client bound to the given RxNorm base URL. An empty baseURL
// falls back to the public default. The underlying *http.Client is created with
// a bounded timeout (defaultTimeout).
func New(baseURL string) Client {
	return NewWithClient(baseURL, &http.Client{Timeout: defaultTimeout})
}

// NewWithClient constructs a Client bound to the given RxNorm base URL that uses
// the supplied *http.Client for outbound requests. It exists primarily for
// testing (to inject a stubbed transport) but is also useful when callers want
// to share/tune a custom client.
func NewWithClient(baseURL string, c *http.Client) Client {
	base := strings.TrimSpace(baseURL)
	if base == "" {
		base = defaultBaseURL
	}
	if c == nil {
		c = &http.Client{Timeout: defaultTimeout}
	}
	return &httpClient{
		base:   strings.TrimRight(base, "/"),
		client: c,
	}
}

// ----------------------------------------------------------------------------
// RxNorm JSON payload models (only the fields we consume)
// ----------------------------------------------------------------------------

// drugsResponse models the subset of the /drugs.json payload this client
// consumes; it mirrors the shape previously decoded in prescription/service.go.
type drugsResponse struct {
	DrugGroup struct {
		Name         string             `json:"name"`
		ConceptGroup []drugConceptGroup `json:"conceptGroup"`
	} `json:"drugGroup"`
}

type drugConceptGroup struct {
	TTY               string                `json:"tty"`
	ConceptProperties []drugConceptProperty `json:"conceptProperties"`
}

type drugConceptProperty struct {
	RxCUI   string `json:"rxcui"`
	Name    string `json:"name"`
	Synonym string `json:"synonym"`
	TTY     string `json:"tty"`
}

// approximateResponse models the subset of the /approximateTerm.json payload
// this client consumes.
type approximateResponse struct {
	ApproximateGroup struct {
		InputTerm string             `json:"inputTerm"`
		Candidate []approximateMatch `json:"candidate"`
	} `json:"approximateGroup"`
}

type approximateMatch struct {
	RxCUI string `json:"rxcui"`
	Name  string `json:"rxcuiName"`
	TTY   string `json:"tty"`
	Score string `json:"score"`
	Rank  string `json:"rank"`
}

// allConceptsResponse models the subset of the /allconcepts.json payload this
// client consumes for index seeding.
type allConceptsResponse struct {
	MinConceptGroup struct {
		MinConcept []minConcept `json:"minConcept"`
	} `json:"minConceptGroup"`
}

type minConcept struct {
	RxCUI string `json:"rxcui"`
	Name  string `json:"name"`
	TTY   string `json:"tty"`
}

// ----------------------------------------------------------------------------
// Client interface implementation
// ----------------------------------------------------------------------------

// SearchByName performs the /drugs.json?name= lookup and de-duplicates the
// flattened concept list by RxCUI. An empty/whitespace name yields an empty
// (non-error) result; a transport/parse/ non-2xx failure yields an error.
func (c *httpClient) SearchByName(ctx context.Context, name string) ([]RxNormConcept, error) {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil, nil
	}

	endpoint := c.base + "/drugs.json?name=" + url.QueryEscape(name)

	var parsed drugsResponse
	if err := c.getJSON(ctx, endpoint, "searchByName", &parsed); err != nil {
		return nil, err
	}

	// Flatten every conceptProperties array across all conceptGroups and
	// de-duplicate by RxCUI so a drug that surfaces under multiple term types
	// is returned once.
	seen := make(map[string]struct{}, 16)
	concepts := make([]RxNormConcept, 0, 16)
	for _, group := range parsed.DrugGroup.ConceptGroup {
		for _, cp := range group.ConceptProperties {
			if cp.RxCUI == "" {
				continue
			}
			if _, dup := seen[cp.RxCUI]; dup {
				continue
			}
			seen[cp.RxCUI] = struct{}{}
			concepts = append(concepts, RxNormConcept{
				RxCUI:   cp.RxCUI,
				Name:    cp.Name,
				Synonym: cp.Synonym,
				TTY:     cp.TTY,
			})
		}
	}

	logger.Get().Debug("rxnorm: searchByName", "name", name, "hits", len(concepts))
	return concepts, nil
}

// GetApproximateMatch performs the /approximateTerm.json?term= lookup and maps
// the ranked candidates onto RxNormConcept. An empty/whitespace term yields an
// empty (non-error) result.
func (c *httpClient) GetApproximateMatch(ctx context.Context, term string) ([]RxNormConcept, error) {
	term = strings.TrimSpace(term)
	if term == "" {
		return nil, nil
	}

	// maxEntries caps the candidate window so a wildly generic term cannot
	// pull thousands of rows.
	endpoint := c.base + "/approximateTerm.json?term=" + url.QueryEscape(term) + "&maxEntries=20"

	var parsed approximateResponse
	if err := c.getJSON(ctx, endpoint, "approximateMatch", &parsed); err != nil {
		return nil, err
	}

	candidates := parsed.ApproximateGroup.Candidate
	concepts := make([]RxNormConcept, 0, len(candidates))
	for _, cand := range candidates {
		if cand.RxCUI == "" {
			continue
		}
		concepts = append(concepts, RxNormConcept{
			RxCUI: cand.RxCUI,
			Name:  cand.Name,
			TTY:   cand.TTY,
		})
	}

	logger.Get().Debug("rxnorm: approximateMatch", "term", term, "hits", len(concepts))
	return concepts, nil
}

// FetchSeedConcepts pulls the prescribable concept set (term types IN, SCD and
// SBD) from /allconcepts.json. The result feeds the local-index seeder. It is a
// large response (≈10–15k ingredients) so callers should run it from a
// background/seed context rather than a request path.
func (c *httpClient) FetchSeedConcepts(ctx context.Context) ([]RxNormConcept, error) {
	// Request the prescribable term types only; RxNorm accepts a "+"-joined list.
	endpoint := c.base + "/allconcepts.json?tty=IN+SCD+SBD"

	var parsed allConceptsResponse
	if err := c.getJSON(ctx, endpoint, "fetchSeedConcepts", &parsed); err != nil {
		return nil, err
	}

	mins := parsed.MinConceptGroup.MinConcept
	concepts := make([]RxNormConcept, 0, len(mins))
	for _, mc := range mins {
		if mc.RxCUI == "" {
			continue
		}
		concepts = append(concepts, RxNormConcept{
			RxCUI: mc.RxCUI,
			Name:  mc.Name,
			TTY:   mc.TTY,
		})
	}

	logger.Get().Info("rxnorm: fetched seed concepts", "count", len(concepts))
	return concepts, nil
}

// ----------------------------------------------------------------------------
// Shared request helper
// ----------------------------------------------------------------------------

// rxNormError is the sentinel-style error returned for any transport, non-2xx or
// decode failure. It is a concrete type so callers can errors.As it if they
// want to distinguish upstream failures from local ones.
type rxNormError struct {
	op  string
	msg string
	err error
}

// Error implements the error interface.
func (e *rxNormError) Error() string {
	if e.err != nil {
		return fmt.Sprintf("rxnorm: %s: %s: %v", e.op, e.msg, e.err)
	}
	return fmt.Sprintf("rxnorm: %s: %s", e.op, e.msg)
}

// Unwrap allows errors.Is / errors.As to reach the wrapped cause.
func (e *rxNormError) Unwrap() error { return e.err }

// getJSON performs a context-aware GET against endpoint, enforces a 2xx status
// and decodes the JSON body into out. It logs structured context for every
// failure mode so an upstream issue is diagnosable from logs alone.
func (c *httpClient) getJSON(ctx context.Context, endpoint, op string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		logger.Get().Error("rxnorm: request build failed", "op", op, "error", err)
		return &rxNormError{op: op, msg: "request build failed", err: err}
	}

	resp, err := c.client.Do(req)
	if err != nil {
		logger.Get().Error("rxnorm: request failed", "op", op, "error", err)
		return &rxNormError{op: op, msg: "request failed", err: err}
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		logger.Get().Error("rxnorm: non-2xx status", "op", op, "status", resp.StatusCode)
		return &rxNormError{op: op, msg: fmt.Sprintf("non-2xx status %d", resp.StatusCode)}
	}

	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		logger.Get().Error("rxnorm: decode failed", "op", op, "error", err)
		return &rxNormError{op: op, msg: "decode failed", err: err}
	}

	return nil
}
