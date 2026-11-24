package previsit

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestHTTPAIClient_Turn(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/previsit/turn" {
			t.Fatalf("path %s", r.URL.Path)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"assistant_message":   "سوال بعدی",
			"phase":               "STRUCTURED",
			"structured_answers":  map[string]string{"chief_complaint": "سردرد"},
			"report":              nil,
			"model":               "deepseek-chat",
			"engine":              "langchain_avalai",
		})
	}))
	defer srv.Close()

	c := NewHTTPAIClient(srv.URL, 2*time.Second)
	resp, err := c.Turn(context.Background(), AITurnRequest{
		SessionID:      "s",
		Phase:          "STRUCTURED",
		PatientMessage: "سردرد",
	})
	if err != nil {
		t.Fatal(err)
	}
	if resp.AssistantMessage == "" {
		t.Fatal("empty assistant message")
	}
	if resp.StructuredAnswers["chief_complaint"] != "سردرد" {
		t.Fatalf("answers=%v", resp.StructuredAnswers)
	}
}

type fakeAI struct {
	turn *AITurnResponse
}

func (f *fakeAI) Turn(ctx context.Context, req AITurnRequest) (*AITurnResponse, error) {
	return f.turn, nil
}
func (f *fakeAI) Finalize(ctx context.Context, req AIFinalizeRequest) (*AIFinalizeResponse, error) {
	return &AIFinalizeResponse{Report: f.turn.Report}, nil
}

func TestPatientTurn_PersistsMessages(t *testing.T) {
	ctx := context.Background()
	ai := &fakeAI{turn: &AITurnResponse{
		AssistantMessage:  "از کی شروع شده؟",
		Phase:             PhaseStructured,
		StructuredAnswers: map[string]string{"chief_complaint": "سردرد"},
	}}
	svc := NewService(NewMemSessionStore(), NewMemMessageStore(), ai)

	appt := mustOID()
	patient := mustOID()
	doctor := mustOID()
	if _, err := svc.CreateForAppointment(ctx, appt, patient, doctor); err != nil {
		t.Fatal(err)
	}

	res, err := svc.PatientTurn(ctx, appt, patient, "سردرد")
	if err != nil {
		t.Fatal(err)
	}
	if res.AssistantMessage == "" {
		t.Fatal("missing assistant")
	}
	if res.Session.Status != StatusInProgress {
		t.Fatalf("status=%s", res.Session.Status)
	}
	if len(res.Messages) < 2 {
		t.Fatalf("expected user+assistant messages, got %d", len(res.Messages))
	}
}

func mustOID() string {
	return primitive.NewObjectID().Hex()
}
