package rxnorm

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// newTestClient wires a Client against a test server that replies with body for
// every request, letting us assert on the parsed/flattened output.
func newTestClient(t *testing.T, status int, body string) Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_, _ = w.Write([]byte(body))
	}))
	t.Cleanup(srv.Close)
	return NewWithClient(srv.URL, srv.Client())
}

func TestSearchByNameFlattensAndDedupes(t *testing.T) {
	// Two conceptGroups both surface rxcui 161 (a dup) plus a unique concept.
	body := `{
		"drugGroup": {
			"name": "acetaminophen",
			"conceptGroup": [
				{"tty":"IN","conceptProperties":[
					{"rxcui":"161","name":"Acetaminophen","tty":"IN"},
					{"rxcui":"","name":"no cui","tty":"IN"}
				]},
				{"tty":"SCD","conceptProperties":[
					{"rxcui":"161","name":"Acetaminophen 500 MG","tty":"SCD"},
					{"rxcui":"209387","name":"Acetaminophen / Diphenhydramine","tty":"SCD"}
				]}
			]
		}
	}`
	c := newTestClient(t, http.StatusOK, body)

	got, err := c.SearchByName(context.Background(), "acetaminophen")
	if err != nil {
		t.Fatalf("SearchByName returned error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 deduplicated concepts, got %d: %+v", len(got), got)
	}
	if got[0].RxCUI != "161" || got[0].TTY != "IN" {
		t.Errorf("first concept = %+v, want rxcui 161 / tty IN", got[0])
	}
}

func TestSearchByNameEmptyReturnsNil(t *testing.T) {
	c := newTestClient(t, http.StatusOK, `{}`)
	got, err := c.SearchByName(context.Background(), "   ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != nil {
		t.Errorf("expected nil for empty query, got %+v", got)
	}
}

func TestSearchByNameNon2xxIsError(t *testing.T) {
	c := newTestClient(t, http.StatusBadGateway, `{}`)
	_, err := c.SearchByName(context.Background(), "x")
	if err == nil {
		t.Fatal("expected error for non-2xx status, got nil")
	}
	var rxErr *rxNormError
	if !errors.As(err, &rxErr) {
		t.Errorf("expected *rxNormError, got %T (%v)", err, err)
	}
}

func TestFetchSeedConcepts(t *testing.T) {
	body := `{
		"minConceptGroup": {
			"minConcept": [
				{"rxcui":"161","name":"Acetaminophen","tty":"IN"},
				{"rxcui":"","name":"empty","tty":"IN"},
				{"rxcui":"1234","name":"Product","tty":"SCD"}
			]
		}
	}`
	c := newTestClient(t, http.StatusOK, body)

	got, err := c.FetchSeedConcepts(context.Background())
	if err != nil {
		t.Fatalf("FetchSeedConcepts returned error: %v", err)
	}
	if len(got) != 2 {
		t.Fatalf("expected 2 concepts (empty cui dropped), got %d", len(got))
	}
}

func TestGetApproximateMatch(t *testing.T) {
	body := `{
		"approximateGroup": {
			"inputTerm": "acetamenophen",
			"candidate": [
				{"rxcui":"161","rxcuiName":"Acetaminophen","tty":"IN","score":"100","rank":"1"},
				{"rxcui":"","rxcuiName":"none","tty":"IN"}
			]
		}
	}`
	c := newTestClient(t, http.StatusOK, body)

	got, err := c.GetApproximateMatch(context.Background(), "acetamenophen")
	if err != nil {
		t.Fatalf("GetApproximateMatch returned error: %v", err)
	}
	if len(got) != 1 || got[0].RxCUI != "161" {
		t.Fatalf("expected single concept 161, got %+v", got)
	}
}

func TestNewDefaultsBaseURL(t *testing.T) {
	c := New("").(*httpClient)
	if !strings.HasPrefix(c.base, "https://rxnav.nlm.nih.gov") {
		t.Errorf("expected default base URL, got %q", c.base)
	}
	if c.client == nil || c.client.Timeout == 0 {
		t.Error("expected a configured *http.Client with a timeout")
	}
}
