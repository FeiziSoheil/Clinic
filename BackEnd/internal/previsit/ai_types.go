package previsit

// AITurnRequest is the payload sent to the Python sidecar.
type AITurnRequest struct {
	SessionID         string            `json:"session_id"`
	Phase             string            `json:"phase"`
	StructuredAnswers map[string]string `json:"structured_answers"`
	Messages          []AIChatMessage   `json:"messages"`
	PatientMessage    string            `json:"patient_message"`
	Locale            string            `json:"locale"`
}

// AIChatMessage is one message in the sidecar transcript.
type AIChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

// AITurnResponse is returned by POST /v1/previsit/turn.
type AITurnResponse struct {
	AssistantMessage  string            `json:"assistant_message"`
	Phase             string            `json:"phase"`
	StructuredAnswers map[string]string `json:"structured_answers"`
	Report            *PreVisitReport   `json:"report"`
	Model             string            `json:"model"`
	Engine            string            `json:"engine"`
}

// AIFinalizeRequest is the payload for POST /v1/previsit/finalize.
type AIFinalizeRequest struct {
	SessionID         string            `json:"session_id"`
	StructuredAnswers map[string]string `json:"structured_answers"`
	Messages          []AIChatMessage   `json:"messages"`
	Locale            string            `json:"locale"`
}

// AIFinalizeResponse is returned by finalize.
type AIFinalizeResponse struct {
	Report *PreVisitReport `json:"report"`
	Model  string          `json:"model"`
	Engine string          `json:"engine"`
}
