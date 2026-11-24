package previsit

import (
	"context"
	"errors"
	"strings"
	"time"

	"clinic-api/pkg/database"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// AppointmentPartiesLookup resolves patient/doctor ids for an appointment.
type AppointmentPartiesLookup interface {
	GetAppointmentParties(ctx context.Context, appointmentID string) (patientID, doctorID string, err error)
}

// Service orchestrates pre-visit sessions. AI client is optional until Task 4.
type Service struct {
	sessions   SessionStore
	messages   MessageStore
	ai         AIClient
	appointments AppointmentPartiesLookup
}

// AIClient is satisfied in Task 4; nil means turns that need LLM fail with ErrAIUnavailable.
type AIClient interface {
	Turn(ctx context.Context, req AITurnRequest) (*AITurnResponse, error)
	Finalize(ctx context.Context, req AIFinalizeRequest) (*AIFinalizeResponse, error)
}

// NewService constructs a previsit Service. ai may be nil for persistence-only paths.
func NewService(sessions SessionStore, messages MessageStore, ai AIClient) *Service {
	return &Service{sessions: sessions, messages: messages, ai: ai}
}

// SetAppointmentLookup wires optional appointment ownership resolution for EnsureSession.
func (s *Service) SetAppointmentLookup(lookup AppointmentPartiesLookup) {
	s.appointments = lookup
}

// EnsureSessionForPatient returns the active session, creating it from the appointment if needed.
func (s *Service) EnsureSessionForPatient(ctx context.Context, appointmentID, patientID string) (*SessionResponse, error) {
	existing, err := s.GetByAppointment(ctx, appointmentID, patientID, "PATIENT")
	if err == nil {
		return existing, nil
	}
	if !errors.Is(err, ErrSessionNotFound) {
		return nil, err
	}
	if s.appointments == nil {
		return nil, ErrSessionNotFound
	}
	ownerPatient, doctorID, err := s.appointments.GetAppointmentParties(ctx, appointmentID)
	if err != nil {
		return nil, err
	}
	if ownerPatient != patientID {
		return nil, ErrForbidden
	}
	return s.CreateForAppointment(ctx, appointmentID, patientID, doctorID)
}

// CreateForAppointment ensures an active session exists for the appointment.
func (s *Service) CreateForAppointment(ctx context.Context, appointmentID, patientID, doctorID string) (*SessionResponse, error) {
	apptOID, err := parseOID(appointmentID)
	if err != nil {
		return nil, err
	}
	patientOID, err := parseOID(patientID)
	if err != nil {
		return nil, err
	}
	doctorOID, err := parseOID(doctorID)
	if err != nil {
		return nil, err
	}

	existing, err := s.sessions.FindActiveByAppointment(ctx, apptOID)
	if err == nil && existing != nil {
		return existing.ToResponse(true), nil
	}
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		return nil, err
	}

	now := time.Now().UTC()
	sess := PreVisitSession{
		AppointmentID:     apptOID,
		PatientID:         patientOID,
		DoctorID:          doctorOID,
		Status:            StatusPending,
		Phase:             PhaseStructured,
		StructuredAnswers: map[string]string{},
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	created, err := s.sessions.Insert(ctx, sess)
	if err != nil {
		return nil, err
	}
	return created.ToResponse(true), nil
}

// GetByAppointment returns the active session with RBAC.
func (s *Service) GetByAppointment(ctx context.Context, appointmentID, requesterID, role string) (*SessionResponse, error) {
	sess, err := s.loadActive(ctx, appointmentID)
	if err != nil {
		return nil, err
	}
	includeFlags, err := s.authorizeRead(sess, requesterID, role)
	if err != nil {
		return nil, err
	}
	return sess.ToResponse(includeFlags), nil
}

// ListMessages returns the transcript with RBAC.
func (s *Service) ListMessages(ctx context.Context, appointmentID, requesterID, role string) ([]MessageResponse, error) {
	sess, err := s.loadActive(ctx, appointmentID)
	if err != nil {
		return nil, err
	}
	if _, err := s.authorizeRead(sess, requesterID, role); err != nil {
		return nil, err
	}
	rows, err := s.messages.ListBySession(ctx, sess.ID)
	if err != nil {
		return nil, err
	}
	out := make([]MessageResponse, 0, len(rows))
	for i := range rows {
		out = append(out, rows[i].ToResponse())
	}
	return out, nil
}

// ExpireByAppointment marks the active session expired (e.g. on cancel).
func (s *Service) ExpireByAppointment(ctx context.Context, appointmentID string) error {
	apptOID, err := parseOID(appointmentID)
	if err != nil {
		return err
	}
	sess, err := s.sessions.FindActiveByAppointment(ctx, apptOID)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil
		}
		return err
	}
	sess.Status = StatusExpired
	sess.UpdatedAt = time.Now().UTC()
	return s.sessions.Update(ctx, *sess)
}

func (s *Service) loadActive(ctx context.Context, appointmentID string) (*PreVisitSession, error) {
	apptOID, err := parseOID(appointmentID)
	if err != nil {
		return nil, err
	}
	sess, err := s.sessions.FindActiveByAppointment(ctx, apptOID)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return sess, nil
}

// authorizeRead returns whether notable_flags may be included.
func (s *Service) authorizeRead(sess *PreVisitSession, requesterID, role string) (includeFlags bool, err error) {
	reqOID, err := parseOID(requesterID)
	if err != nil {
		return false, err
	}
	switch role {
	case "ADMIN":
		return true, nil
	case "DOCTOR":
		if sess.DoctorID != reqOID {
			return false, ErrForbidden
		}
		return true, nil
	case "PATIENT":
		if sess.PatientID != reqOID {
			return false, ErrForbidden
		}
		return false, nil
	default:
		return false, ErrForbidden
	}
}

// PatientTurn runs one chat turn for the appointment's patient.
func (s *Service) PatientTurn(ctx context.Context, appointmentID, patientID, message string) (*TurnResult, error) {
	sess, err := s.loadActive(ctx, appointmentID)
	if err != nil {
		return nil, err
	}
	patientOID, err := parseOID(patientID)
	if err != nil {
		return nil, err
	}
	if sess.PatientID != patientOID {
		return nil, ErrForbidden
	}
	if sess.Status == StatusExpired {
		return nil, ErrExpired
	}

	now := time.Now().UTC()
	if sess.Status == StatusPending {
		sess.Status = StatusInProgress
		sess.UpdatedAt = now
		if err := s.sessions.Update(ctx, *sess); err != nil {
			return nil, err
		}
	}

	msg := stringsTrim(message)
	if msg != "" {
		if _, err := s.messages.Insert(ctx, PreVisitMessage{
			SessionID: sess.ID,
			Role:      RoleUser,
			Content:   msg,
			CreatedAt: now,
		}); err != nil {
			return nil, err
		}
	}

	history, err := s.messages.ListBySession(ctx, sess.ID)
	if err != nil {
		return nil, err
	}

	// Empty bootstrap turn: if we already have transcript, return it without
	// appending another identical assistant question (Strict Mode / retries).
	if msg == "" && len(history) > 0 {
		msgs := make([]MessageResponse, 0, len(history))
		for i := range history {
			msgs = append(msgs, history[i].ToResponse())
		}
		return &TurnResult{
			Session:          sess.ToResponse(false),
			AssistantMessage: "",
			Messages:         msgs,
		}, nil
	}

	aiMessages := make([]AIChatMessage, 0, len(history))
	for _, h := range history {
		aiMessages = append(aiMessages, AIChatMessage{Role: h.Role, Content: h.Content})
	}

	if s.ai == nil {
		return nil, ErrAIUnavailable
	}

	answers := sess.StructuredAnswers
	if answers == nil {
		answers = map[string]string{}
	}
	aiResp, err := s.ai.Turn(ctx, AITurnRequest{
		SessionID:         sess.ID.Hex(),
		Phase:             sess.Phase,
		StructuredAnswers: answers,
		Messages:          aiMessages,
		PatientMessage:    msg,
		Locale:            "fa",
	})
	if err != nil {
		return nil, err
	}

	assistantText := stringsTrim(aiResp.AssistantMessage)
	if assistantText != "" {
		if _, err := s.messages.Insert(ctx, PreVisitMessage{
			SessionID: sess.ID,
			Role:      RoleAssistant,
			Content:   assistantText,
			CreatedAt: time.Now().UTC(),
		}); err != nil {
			return nil, err
		}
	}

	if aiResp.StructuredAnswers != nil {
		sess.StructuredAnswers = aiResp.StructuredAnswers
	}
	if aiResp.Phase != "" {
		sess.Phase = aiResp.Phase
	}

	if aiResp.Phase == PhaseFinalized {
		report := aiResp.Report
		if report == nil {
			fin, ferr := s.ai.Finalize(ctx, AIFinalizeRequest{
				SessionID:         sess.ID.Hex(),
				StructuredAnswers: sess.StructuredAnswers,
				Messages:          append(aiMessages, AIChatMessage{Role: RoleAssistant, Content: assistantText}),
				Locale:            "fa",
			})
			if ferr != nil {
				return nil, ferr
			}
			report = fin.Report
		}
		if report != nil {
			sess.Report = report
			sess.Status = StatusCompleted
			sess.Phase = PhaseFinalized
			completed := time.Now().UTC()
			sess.CompletedAt = &completed
		}
	}

	sess.UpdatedAt = time.Now().UTC()
	if err := s.sessions.Update(ctx, *sess); err != nil {
		return nil, err
	}

	rows, err := s.messages.ListBySession(ctx, sess.ID)
	if err != nil {
		return nil, err
	}
	msgs := make([]MessageResponse, 0, len(rows))
	for i := range rows {
		msgs = append(msgs, rows[i].ToResponse())
	}

	return &TurnResult{
		Session:          sess.ToResponse(false),
		AssistantMessage: assistantText,
		Messages:         msgs,
	}, nil
}

func stringsTrim(s string) string {
	return strings.TrimSpace(s)
}

func parseOID(hex string) (primitive.ObjectID, error) {
	oid, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		return primitive.NilObjectID, ErrInvalidID
	}
	return oid, nil
}
