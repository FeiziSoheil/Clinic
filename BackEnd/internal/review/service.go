package review

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"clinic-api/internal/user"
	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// Sentinel errors returned by the service. Handlers map them to HTTP statuses.
var (
	ErrNotFound            = errors.New("review: not found")
	ErrForbidden           = errors.New("review: forbidden")
	ErrInvalidObjectID     = errors.New("review: invalid object id")
	ErrInvalidRating       = errors.New("review: rating must be between 1 and 5")
	ErrEmptyBody           = errors.New("review: body is required")
	ErrNotEligible         = errors.New("review: appointment is not eligible for a review")
	ErrAlreadyReviewed     = errors.New("review: this appointment already has a review")
	ErrReplyNotAllowed     = errors.New("review: doctor may reply only to approved reviews")
	ErrInvalidStatus       = errors.New("review: invalid status")
	ErrAppointmentNotFound = errors.New("review: appointment not found")
)

// CompletedAppointment is the review domain's view of a booking needed to
// validate create eligibility. Populated by an adapter in bootstrap so this
// package never imports internal/booking.
type CompletedAppointment struct {
	ID        primitive.ObjectID
	PatientID primitive.ObjectID
	DoctorID  primitive.ObjectID
	Status    string
}

// AppointmentLookup loads an appointment by id for eligibility checks.
type AppointmentLookup interface {
	FindAppointment(ctx context.Context, id primitive.ObjectID) (*CompletedAppointment, error)
}

// DoctorProfileResolver maps a doctor USER id ↔ PROFILE id for public listing.
type DoctorProfileResolver interface {
	// ResolveUserIDByProfileID returns the user id linked to a public profile id.
	ResolveUserIDByProfileID(ctx context.Context, profileID primitive.ObjectID) (primitive.ObjectID, error)
	// ResolveProfileIDByUserID returns the public profile id for a doctor user.
	ResolveProfileIDByUserID(ctx context.Context, userID primitive.ObjectID) (primitive.ObjectID, error)
}

// PatientNameReader supplies first/last name for author initials.
type PatientNameReader interface {
	GetName(ctx context.Context, userID primitive.ObjectID) (firstName, lastName string, err error)
}

// Service owns review business rules.
type Service struct {
	repo       *database.Repository[Review]
	appointments AppointmentLookup
	profiles   DoctorProfileResolver
	patients   PatientNameReader
}

// NewService constructs a Service. Collaborators may be nil until setters are
// called; CreateReview requires appointments + patients.
func NewService(repo *database.Repository[Review]) *Service {
	return &Service{repo: repo}
}

// SetAppointmentLookup wires the completed-appointment eligibility collaborator.
func (s *Service) SetAppointmentLookup(l AppointmentLookup) { s.appointments = l }

// SetDoctorProfileResolver wires profile ↔ user id resolution.
func (s *Service) SetDoctorProfileResolver(r DoctorProfileResolver) { s.profiles = r }

// SetPatientNameReader wires patient name lookup for author initials.
func (s *Service) SetPatientNameReader(r PatientNameReader) { s.patients = r }

// CreateReview lets a patient submit a review for a COMPLETED appointment they
// own. One review per appointment (enforced by unique index + pre-check).
func (s *Service) CreateReview(ctx context.Context, patientIDHex, role string, req *CreateReviewRequest) (*ReviewResponse, error) {
	if role != string(user.RolePatient) {
		return nil, ErrForbidden
	}
	if req.Rating < 1 || req.Rating > 5 {
		return nil, ErrInvalidRating
	}
	body := strings.TrimSpace(req.Body)
	if body == "" {
		return nil, ErrEmptyBody
	}

	patientOID, err := primitive.ObjectIDFromHex(patientIDHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	apptOID, err := primitive.ObjectIDFromHex(req.AppointmentID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	if s.appointments == nil {
		return nil, fmt.Errorf("review: appointment lookup not configured")
	}

	appt, err := s.appointments.FindAppointment(ctx, apptOID)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrAppointmentNotFound
		}
		return nil, err
	}
	if appt.PatientID != patientOID {
		return nil, ErrForbidden
	}
	if appt.Status != "COMPLETED" {
		return nil, ErrNotEligible
	}

	// Pre-check for a clearer conflict than a raw duplicate-key error.
	if existing, ferr := s.repo.FindOne(ctx, bson.M{"appointment_id": apptOID}); ferr == nil && existing != nil {
		return nil, ErrAlreadyReviewed
	} else if ferr != nil && !errors.Is(ferr, database.ErrNotFound) {
		return nil, ferr
	}

	initials := "ب"
	if s.patients != nil {
		fn, ln, nerr := s.patients.GetName(ctx, patientOID)
		if nerr == nil {
			initials = makeInitials(fn, ln)
		}
	}

	var profileID primitive.ObjectID
	if s.profiles != nil {
		if pid, perr := s.profiles.ResolveProfileIDByUserID(ctx, appt.DoctorID); perr == nil {
			profileID = pid
		}
	}

	now := time.Now().UTC()
	rev := Review{
		ID:              primitive.NewObjectID(),
		AppointmentID:   apptOID,
		PatientID:       patientOID,
		DoctorID:        appt.DoctorID,
		DoctorProfileID: profileID,
		Rating:          req.Rating,
		Body:            body,
		Status:          StatusPending,
		AuthorInitials:  initials,
		HelpfulCount:    0,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if _, err := s.repo.Insert(ctx, rev); err != nil {
		if isDuplicateKey(err) {
			return nil, ErrAlreadyReviewed
		}
		logger.Get().Error("review: create insert failed", "error", err)
		return nil, err
	}
	return rev.ToResponse(), nil
}

// ListPublicByDoctor returns APPROVED reviews + summary for a doctor identified
// by public PROFILE id (preferred) or USER id.
func (s *Service) ListPublicByDoctor(ctx context.Context, doctorIDHex string) (*PublicReviewsResponse, error) {
	doctorOID, err := primitive.ObjectIDFromHex(doctorIDHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	filter := bson.M{"status": StatusApproved}
	// Prefer matching by doctor_profile_id (public directory id); also accept
	// doctor_id (user id) so either identifier works.
	or := []bson.M{{"doctor_profile_id": doctorOID}, {"doctor_id": doctorOID}}
	if s.profiles != nil {
		if userID, rerr := s.profiles.ResolveUserIDByProfileID(ctx, doctorOID); rerr == nil {
			or = append(or, bson.M{"doctor_id": userID})
		}
	}
	filter["$or"] = or

	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	rows, err := s.repo.FindAllWithOpts(ctx, filter, opts)
	if err != nil {
		return nil, err
	}

	out := &PublicReviewsResponse{
		Reviews: make([]*PublicReviewResponse, 0, len(rows)),
		Summary: RatingSummary{},
	}
	var sum int
	for _, r := range rows {
		out.Reviews = append(out.Reviews, r.ToPublicResponse())
		sum += r.Rating
		idx := r.Rating - 1
		if idx >= 0 && idx < 5 {
			out.Summary.Distribution[idx]++
		}
	}
	out.Summary.Total = len(rows)
	if out.Summary.Total > 0 {
		out.Summary.Average = float64(sum) / float64(out.Summary.Total)
		// Round to 1 decimal place.
		out.Summary.Average = float64(int(out.Summary.Average*10+0.5)) / 10
	}
	return out, nil
}

// ListForDoctor returns all statuses for the signed-in doctor (self only).
func (s *Service) ListForDoctor(ctx context.Context, doctorIDHex, role string) ([]*ReviewResponse, error) {
	if role != string(user.RoleDoctor) {
		return nil, ErrForbidden
	}
	doctorOID, err := primitive.ObjectIDFromHex(doctorIDHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	rows, err := s.repo.FindAllWithOpts(ctx, bson.M{"doctor_id": doctorOID}, opts)
	if err != nil {
		return nil, err
	}
	return toResponses(rows), nil
}

// ListAdmin returns reviews with optional status / doctor filters.
// doctorIDHex may be a profile id or user id.
func (s *Service) ListAdmin(ctx context.Context, role, status, doctorIDHex string) ([]*ReviewResponse, error) {
	if role != string(user.RoleAdmin) {
		return nil, ErrForbidden
	}
	filter := bson.M{}
	if status != "" {
		st := Status(strings.ToUpper(status))
		switch st {
		case StatusPending, StatusApproved, StatusRejected:
			filter["status"] = st
		default:
			return nil, ErrInvalidStatus
		}
	}
	if doctorIDHex != "" {
		doctorOID, err := primitive.ObjectIDFromHex(doctorIDHex)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
		or := []bson.M{{"doctor_profile_id": doctorOID}, {"doctor_id": doctorOID}}
		if s.profiles != nil {
			if userID, rerr := s.profiles.ResolveUserIDByProfileID(ctx, doctorOID); rerr == nil {
				or = append(or, bson.M{"doctor_id": userID})
			}
		}
		filter["$or"] = or
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	rows, err := s.repo.FindAllWithOpts(ctx, filter, opts)
	if err != nil {
		return nil, err
	}
	return toResponses(rows), nil
}

// Moderate updates a review's status (admin only). APPROVED↔REJECTED (hide) and
// PENDING→APPROVED/REJECTED are supported.
func (s *Service) Moderate(ctx context.Context, role, reviewIDHex, newStatus string) (*ReviewResponse, error) {
	if role != string(user.RoleAdmin) {
		return nil, ErrForbidden
	}
	st := Status(strings.ToUpper(newStatus))
	switch st {
	case StatusPending, StatusApproved, StatusRejected:
	default:
		return nil, ErrInvalidStatus
	}
	oid, err := primitive.ObjectIDFromHex(reviewIDHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	rev, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	now := time.Now().UTC()
	if err := s.repo.Update(ctx, oid, bson.M{"$set": bson.M{
		"status":     st,
		"updated_at": now,
	}}); err != nil {
		return nil, err
	}
	rev.Status = st
	rev.UpdatedAt = now
	return rev.ToResponse(), nil
}

// Reply lets the owning doctor post a public reply only when status is APPROVED.
func (s *Service) Reply(ctx context.Context, doctorIDHex, role, reviewIDHex, reply string) (*ReviewResponse, error) {
	if role != string(user.RoleDoctor) {
		return nil, ErrForbidden
	}
	reply = strings.TrimSpace(reply)
	if reply == "" {
		return nil, ErrEmptyBody
	}
	doctorOID, err := primitive.ObjectIDFromHex(doctorIDHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	oid, err := primitive.ObjectIDFromHex(reviewIDHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	rev, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if rev.DoctorID != doctorOID {
		return nil, ErrForbidden
	}
	if rev.Status != StatusApproved {
		return nil, ErrReplyNotAllowed
	}
	now := time.Now().UTC()
	if err := s.repo.Update(ctx, oid, bson.M{"$set": bson.M{
		"doctor_reply": reply,
		"replied_at":   now,
		"updated_at":   now,
	}}); err != nil {
		return nil, err
	}
	rev.DoctorReply = reply
	rev.RepliedAt = &now
	rev.UpdatedAt = now
	return rev.ToResponse(), nil
}

// ListMineByPatient returns the patient's own reviews (any status).
func (s *Service) ListMineByPatient(ctx context.Context, patientIDHex, role string) ([]*ReviewResponse, error) {
	if role != string(user.RolePatient) {
		return nil, ErrForbidden
	}
	patientOID, err := primitive.ObjectIDFromHex(patientIDHex)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	rows, err := s.repo.FindAllWithOpts(ctx, bson.M{"patient_id": patientOID}, opts)
	if err != nil {
		return nil, err
	}
	return toResponses(rows), nil
}

func toResponses(rows []*Review) []*ReviewResponse {
	out := make([]*ReviewResponse, 0, len(rows))
	for _, r := range rows {
		out = append(out, r.ToResponse())
	}
	return out
}

func makeInitials(firstName, lastName string) string {
	f := firstRune(strings.TrimSpace(firstName))
	l := firstRune(strings.TrimSpace(lastName))
	switch {
	case f != "" && l != "":
		return f + "." + l
	case f != "":
		return f
	case l != "":
		return l
	default:
		return "ب"
	}
}

func firstRune(s string) string {
	if s == "" {
		return ""
	}
	r, _ := utf8.DecodeRuneInString(s)
	if r == utf8.RuneError {
		return ""
	}
	return string(r)
}

func isDuplicateKey(err error) bool {
	var we mongo.WriteException
	if errors.As(err, &we) {
		for _, e := range we.WriteErrors {
			if e.Code == 11000 {
				return true
			}
		}
	}
	return mongo.IsDuplicateKeyError(err)
}
