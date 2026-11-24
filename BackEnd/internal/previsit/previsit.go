// Package previsit owns AI-assisted patient intake sessions tied to appointments.
package previsit

import (
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

const (
	StatusPending     = "PENDING"
	StatusInProgress  = "IN_PROGRESS"
	StatusCompleted   = "COMPLETED"
	StatusExpired     = "EXPIRED"

	PhaseStructured = "STRUCTURED"
	PhaseFreeChat   = "FREE_CHAT"
	PhaseFinalized  = "FINALIZED"

	RoleUser      = "user"
	RoleAssistant = "assistant"
	RoleSystem    = "system"
)

var (
	ErrSessionNotFound = errors.New("previsit: session not found")
	ErrForbidden       = errors.New("previsit: forbidden")
	ErrExpired         = errors.New("previsit: session expired")
	ErrInvalidID       = errors.New("previsit: invalid id")
	ErrAIUnavailable   = errors.New("previsit: ai unavailable")
)

// SymptomItem is one structured symptom line inside a report.
type SymptomItem struct {
	Name     string `bson:"name,omitempty" json:"name,omitempty"`
	Duration string `bson:"duration,omitempty" json:"duration,omitempty"`
	Severity string `bson:"severity,omitempty" json:"severity,omitempty"`
}

// PreVisitReport is the doctor-facing structured summary.
type PreVisitReport struct {
	ChiefComplaint   string        `bson:"chief_complaint" json:"chief_complaint"`
	Symptoms         []SymptomItem `bson:"symptoms" json:"symptoms"`
	Medications      string        `bson:"medications" json:"medications"`
	Allergies        string        `bson:"allergies" json:"allergies"`
	RelevantHistory  string        `bson:"relevant_history" json:"relevant_history"`
	NotableFlags     []string      `bson:"notable_flags" json:"notable_flags"`
	SummaryFa        string        `bson:"summary_fa" json:"summary_fa"`
	Model            string        `bson:"model,omitempty" json:"model,omitempty"`
	Engine           string        `bson:"engine,omitempty" json:"engine,omitempty"`
}

// PreVisitSession is one intake session per appointment.
type PreVisitSession struct {
	ID                 primitive.ObjectID     `bson:"_id,omitempty" json:"id,omitempty"`
	AppointmentID      primitive.ObjectID     `bson:"appointment_id" json:"appointment_id"`
	PatientID          primitive.ObjectID     `bson:"patient_id" json:"patient_id"`
	DoctorID           primitive.ObjectID     `bson:"doctor_id" json:"doctor_id"`
	Status             string                 `bson:"status" json:"status"`
	Phase              string                 `bson:"phase" json:"phase"`
	StructuredAnswers  map[string]string      `bson:"structured_answers" json:"structured_answers"`
	Report             *PreVisitReport        `bson:"report,omitempty" json:"report,omitempty"`
	CompletedAt        *time.Time             `bson:"completed_at,omitempty" json:"completed_at,omitempty"`
	CreatedAt          time.Time              `bson:"created_at" json:"created_at"`
	UpdatedAt          time.Time              `bson:"updated_at" json:"updated_at"`
}

// PreVisitMessage is one transcript line.
type PreVisitMessage struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	SessionID primitive.ObjectID `bson:"session_id" json:"session_id"`
	Role      string             `bson:"role" json:"role"`
	Content   string             `bson:"content" json:"content"`
	CreatedAt time.Time          `bson:"created_at" json:"created_at"`
}

// SessionResponse is the API DTO for a session.
type SessionResponse struct {
	ID                string            `json:"id"`
	AppointmentID     string            `json:"appointment_id"`
	PatientID         string            `json:"patient_id"`
	DoctorID          string            `json:"doctor_id"`
	Status            string            `json:"status"`
	Phase             string            `json:"phase"`
	StructuredAnswers map[string]string `json:"structured_answers"`
	Report            *PreVisitReport   `json:"report"`
	CompletedAt       *time.Time        `json:"completed_at,omitempty"`
	CreatedAt         time.Time         `json:"created_at"`
	UpdatedAt         time.Time         `json:"updated_at"`
}

// MessageResponse is the API DTO for a transcript line.
type MessageResponse struct {
	ID        string    `json:"id"`
	SessionID string    `json:"session_id"`
	Role      string    `json:"role"`
	Content   string    `json:"content"`
	CreatedAt time.Time `json:"created_at"`
}

// TurnRequestBody is the patient chat payload.
type TurnRequestBody struct {
	Message string `json:"message"`
}

// TurnResult is returned to the patient after one turn.
type TurnResult struct {
	Session          *SessionResponse  `json:"session"`
	AssistantMessage string            `json:"assistant_message"`
	Messages         []MessageResponse `json:"messages,omitempty"`
}

func (s *PreVisitSession) ToResponse(includeFlags bool) *SessionResponse {
	if s == nil {
		return nil
	}
	answers := s.StructuredAnswers
	if answers == nil {
		answers = map[string]string{}
	}
	var report *PreVisitReport
	if s.Report != nil {
		cp := *s.Report
		if !includeFlags {
			cp.NotableFlags = nil
		}
		report = &cp
	}
	return &SessionResponse{
		ID:                s.ID.Hex(),
		AppointmentID:     s.AppointmentID.Hex(),
		PatientID:         s.PatientID.Hex(),
		DoctorID:          s.DoctorID.Hex(),
		Status:            s.Status,
		Phase:             s.Phase,
		StructuredAnswers: answers,
		Report:            report,
		CompletedAt:       s.CompletedAt,
		CreatedAt:         s.CreatedAt,
		UpdatedAt:         s.UpdatedAt,
	}
}

func (m *PreVisitMessage) ToResponse() MessageResponse {
	return MessageResponse{
		ID:        m.ID.Hex(),
		SessionID: m.SessionID.Hex(),
		Role:      m.Role,
		Content:   m.Content,
		CreatedAt: m.CreatedAt,
	}
}
