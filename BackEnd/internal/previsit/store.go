package previsit

import (
	"context"
	"errors"
	"sync"
	"time"

	"clinic-api/pkg/database"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// SessionStore persists pre-visit sessions.
type SessionStore interface {
	Insert(ctx context.Context, s PreVisitSession) (PreVisitSession, error)
	FindActiveByAppointment(ctx context.Context, appointmentID primitive.ObjectID) (*PreVisitSession, error)
	FindByID(ctx context.Context, id primitive.ObjectID) (*PreVisitSession, error)
	Update(ctx context.Context, s PreVisitSession) error
}

// MessageStore persists transcript lines.
type MessageStore interface {
	Insert(ctx context.Context, m PreVisitMessage) (PreVisitMessage, error)
	ListBySession(ctx context.Context, sessionID primitive.ObjectID) ([]PreVisitMessage, error)
}

// ---------------------------------------------------------------------------
// Mongo implementations
// ---------------------------------------------------------------------------

type mongoSessionStore struct {
	repo *database.Repository[PreVisitSession]
}

func NewMongoSessionStore(repo *database.Repository[PreVisitSession]) SessionStore {
	return &mongoSessionStore{repo: repo}
}

func (s *mongoSessionStore) Insert(ctx context.Context, sess PreVisitSession) (PreVisitSession, error) {
	if sess.ID.IsZero() {
		sess.ID = primitive.NewObjectID()
	}
	id, err := s.repo.Insert(ctx, sess)
	if err != nil {
		return PreVisitSession{}, err
	}
	sess.ID = id
	return sess, nil
}

func (s *mongoSessionStore) FindActiveByAppointment(ctx context.Context, appointmentID primitive.ObjectID) (*PreVisitSession, error) {
	filter := bson.M{
		"appointment_id": appointmentID,
		"status":         bson.M{"$ne": StatusExpired},
	}
	opts := options.FindOne().SetSort(bson.D{{Key: "created_at", Value: -1}})
	var out PreVisitSession
	err := s.repo.Collection().FindOne(ctx, filter, opts).Decode(&out)
	if err != nil {
		if errors.Is(err, mongo.ErrNoDocuments) {
			return nil, database.ErrNotFound
		}
		return nil, err
	}
	return &out, nil
}

func (s *mongoSessionStore) FindByID(ctx context.Context, id primitive.ObjectID) (*PreVisitSession, error) {
	return s.repo.FindByID(ctx, id)
}

func (s *mongoSessionStore) Update(ctx context.Context, sess PreVisitSession) error {
	sess.UpdatedAt = time.Now().UTC()
	return s.repo.Update(ctx, sess.ID, bson.M{
		"$set": bson.M{
			"appointment_id":     sess.AppointmentID,
			"patient_id":         sess.PatientID,
			"doctor_id":          sess.DoctorID,
			"status":             sess.Status,
			"phase":              sess.Phase,
			"structured_answers": sess.StructuredAnswers,
			"report":             sess.Report,
			"completed_at":       sess.CompletedAt,
			"updated_at":         sess.UpdatedAt,
		},
	})
}

type mongoMessageStore struct {
	repo *database.Repository[PreVisitMessage]
}

func NewMongoMessageStore(repo *database.Repository[PreVisitMessage]) MessageStore {
	return &mongoMessageStore{repo: repo}
}

func (s *mongoMessageStore) Insert(ctx context.Context, m PreVisitMessage) (PreVisitMessage, error) {
	if m.ID.IsZero() {
		m.ID = primitive.NewObjectID()
	}
	id, err := s.repo.Insert(ctx, m)
	if err != nil {
		return PreVisitMessage{}, err
	}
	m.ID = id
	return m, nil
}

func (s *mongoMessageStore) ListBySession(ctx context.Context, sessionID primitive.ObjectID) ([]PreVisitMessage, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: 1}})
	rows, err := s.repo.FindAllWithOpts(ctx, bson.M{"session_id": sessionID}, opts)
	if err != nil {
		return nil, err
	}
	out := make([]PreVisitMessage, 0, len(rows))
	for _, r := range rows {
		if r != nil {
			out = append(out, *r)
		}
	}
	return out, nil
}

// ---------------------------------------------------------------------------
// In-memory stores (unit tests)
// ---------------------------------------------------------------------------

type memSessionStore struct {
	mu   sync.Mutex
	byID map[primitive.ObjectID]PreVisitSession
}

func NewMemSessionStore() *memSessionStore {
	return &memSessionStore{byID: map[primitive.ObjectID]PreVisitSession{}}
}

func (s *memSessionStore) Insert(ctx context.Context, sess PreVisitSession) (PreVisitSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess.ID.IsZero() {
		sess.ID = primitive.NewObjectID()
	}
	s.byID[sess.ID] = sess
	return sess, nil
}

func (s *memSessionStore) FindActiveByAppointment(ctx context.Context, appointmentID primitive.ObjectID) (*PreVisitSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	var best *PreVisitSession
	for _, v := range s.byID {
		if v.AppointmentID != appointmentID || v.Status == StatusExpired {
			continue
		}
		cp := v
		if best == nil || cp.CreatedAt.After(best.CreatedAt) {
			best = &cp
		}
	}
	if best == nil {
		return nil, database.ErrNotFound
	}
	return best, nil
}

func (s *memSessionStore) FindByID(ctx context.Context, id primitive.ObjectID) (*PreVisitSession, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	v, ok := s.byID[id]
	if !ok {
		return nil, database.ErrNotFound
	}
	cp := v
	return &cp, nil
}

func (s *memSessionStore) Update(ctx context.Context, sess PreVisitSession) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.byID[sess.ID]; !ok {
		return database.ErrNotFound
	}
	sess.UpdatedAt = time.Now().UTC()
	s.byID[sess.ID] = sess
	return nil
}

type memMessageStore struct {
	mu   sync.Mutex
	rows []PreVisitMessage
}

func NewMemMessageStore() *memMessageStore {
	return &memMessageStore{rows: []PreVisitMessage{}}
}

func (s *memMessageStore) Insert(ctx context.Context, m PreVisitMessage) (PreVisitMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if m.ID.IsZero() {
		m.ID = primitive.NewObjectID()
	}
	s.rows = append(s.rows, m)
	return m, nil
}

func (s *memMessageStore) ListBySession(ctx context.Context, sessionID primitive.ObjectID) ([]PreVisitMessage, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]PreVisitMessage, 0)
	for _, r := range s.rows {
		if r.SessionID == sessionID {
			out = append(out, r)
		}
	}
	return out, nil
}
