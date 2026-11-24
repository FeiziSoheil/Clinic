package previsit

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const DefaultAITimeout = 30 * time.Second

// HTTPAIClient talks to the Python previsit sidecar.
type HTTPAIClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewHTTPAIClient returns nil when baseURL is empty.
func NewHTTPAIClient(baseURL string, timeout time.Duration) *HTTPAIClient {
	base := strings.TrimRight(strings.TrimSpace(baseURL), "/")
	if base == "" {
		return nil
	}
	if timeout <= 0 {
		timeout = DefaultAITimeout
	}
	return &HTTPAIClient{
		baseURL: base,
		httpClient: &http.Client{
			Timeout: timeout,
		},
	}
}

func (c *HTTPAIClient) Turn(ctx context.Context, req AITurnRequest) (*AITurnResponse, error) {
	if c == nil || c.baseURL == "" {
		return nil, fmt.Errorf("%w: client not configured", ErrAIUnavailable)
	}
	// Pydantic rejects JSON null for list/dict fields — always send empty containers.
	if req.Messages == nil {
		req.Messages = []AIChatMessage{}
	}
	if req.StructuredAnswers == nil {
		req.StructuredAnswers = map[string]string{}
	}
	var out AITurnResponse
	if err := c.postJSON(ctx, "/v1/previsit/turn", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *HTTPAIClient) Finalize(ctx context.Context, req AIFinalizeRequest) (*AIFinalizeResponse, error) {
	if c == nil || c.baseURL == "" {
		return nil, fmt.Errorf("%w: client not configured", ErrAIUnavailable)
	}
	if req.Messages == nil {
		req.Messages = []AIChatMessage{}
	}
	if req.StructuredAnswers == nil {
		req.StructuredAnswers = map[string]string{}
	}
	var out AIFinalizeResponse
	if err := c.postJSON(ctx, "/v1/previsit/finalize", req, &out); err != nil {
		return nil, err
	}
	return &out, nil
}

func (c *HTTPAIClient) postJSON(ctx context.Context, path string, body any, dest any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+path, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("%w: %v", ErrAIUnavailable, err)
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return fmt.Errorf("%w: HTTP %d: %s", ErrAIUnavailable, resp.StatusCode, strings.TrimSpace(string(payload)))
	}
	if err := json.Unmarshal(payload, dest); err != nil {
		return fmt.Errorf("%w: decode: %v", ErrAIUnavailable, err)
	}
	return nil
}
