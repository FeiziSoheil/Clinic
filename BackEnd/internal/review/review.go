// Package review implements patient review moderation for the clinic SaaS.
//
// Product rules:
//   - Public star average / count are computed ONLY from APPROVED reviews.
//   - One review per completed appointment (unique index on appointment_id).
//     Appointments already carry patient_id + doctor_id + COMPLETED status, so
//     anchoring to appointment_id is the cleanest eligibility model.
//   - Statuses: PENDING | APPROVED | REJECTED (rejected = not public; admin may
//     reject an approved review to hide it after a complaint).
//   - Doctor may reply only when status is APPROVED.
//   - Admin alone may change status (approve / reject / re-hide).
//
// Per Clean Architecture this package lives in internal/ and may import pkg/,
// while pkg/ MUST NEVER import internal/.
package review

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

// Status is the moderation lifecycle of a patient review.
type Status string

const (
	// StatusPending means the review awaits admin moderation and is not public.
	StatusPending Status = "PENDING"
	// StatusApproved means the review is public and may receive a doctor reply.
	StatusApproved Status = "APPROVED"
	// StatusRejected means the review is hidden from the public (never shown, or
	// re-hidden after a prior approval). Admin uses this to hide inappropriate
	// content.
	StatusRejected Status = "REJECTED"
)

// ---------------------------------------------------------------------------
// Entity
// ---------------------------------------------------------------------------

// Review is one patient rating of a doctor after a completed visit.
// DoctorID is the doctor's USER id (same as appointments.doctor_id).
type Review struct {
	ID              primitive.ObjectID `bson:"_id" json:"id"`
	AppointmentID   primitive.ObjectID `bson:"appointment_id" json:"appointment_id"`
	PatientID       primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	DoctorID        primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	DoctorProfileID primitive.ObjectID `bson:"doctor_profile_id,omitempty" json:"doctor_profile_id,omitempty"`
	Rating          int                `bson:"rating" json:"rating"`
	Body            string             `bson:"body" json:"body"`
	Status          Status             `bson:"status" json:"status"`
	AuthorInitials  string             `bson:"author_initials" json:"author_initials"`
	DoctorReply     string             `bson:"doctor_reply,omitempty" json:"doctor_reply,omitempty"`
	RepliedAt       *time.Time         `bson:"replied_at,omitempty" json:"replied_at,omitempty"`
	HelpfulCount    int                `bson:"helpful_count" json:"helpful_count"`
	CreatedAt       time.Time          `bson:"created_at" json:"created_at"`
	UpdatedAt       time.Time          `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the entity into the API DTO.
func (r *Review) ToResponse() *ReviewResponse {
	if r == nil {
		return nil
	}
	resp := &ReviewResponse{
		ID:              r.ID.Hex(),
		AppointmentID:   r.AppointmentID.Hex(),
		PatientID:       r.PatientID.Hex(),
		DoctorID:        r.DoctorID.Hex(),
		DoctorProfileID: "",
		Rating:          r.Rating,
		Body:            r.Body,
		Status:          string(r.Status),
		AuthorInitials:  r.AuthorInitials,
		DoctorReply:     r.DoctorReply,
		HelpfulCount:    r.HelpfulCount,
		CreatedAt:       r.CreatedAt,
		UpdatedAt:       r.UpdatedAt,
	}
	if !r.DoctorProfileID.IsZero() {
		resp.DoctorProfileID = r.DoctorProfileID.Hex()
	}
	if r.RepliedAt != nil {
		t := *r.RepliedAt
		resp.RepliedAt = &t
	}
	return resp
}

// ToPublicResponse is the shape returned on the public doctor profile: no
// patient_id, and only meaningful when status is APPROVED.
func (r *Review) ToPublicResponse() *PublicReviewResponse {
	if r == nil {
		return nil
	}
	resp := &PublicReviewResponse{
		ID:             r.ID.Hex(),
		DoctorID:       r.DoctorID.Hex(),
		AuthorInitials: r.AuthorInitials,
		Date:           r.CreatedAt.Format("2006-01-02"),
		Rating:         r.Rating,
		Body:           r.Body,
		HelpfulCount:   r.HelpfulCount,
	}
	if !r.DoctorProfileID.IsZero() {
		resp.DoctorID = r.DoctorProfileID.Hex()
	}
	if r.DoctorReply != "" {
		resp.DoctorReply = r.DoctorReply
	}
	return resp
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

// CreateReviewRequest is the patient payload for POST /reviews.
type CreateReviewRequest struct {
	AppointmentID string `json:"appointment_id" validate:"required"`
	Rating        int    `json:"rating" validate:"required,min=1,max=5"`
	Body          string `json:"body" validate:"required,min=3,max=2000"`
}

// ReplyReviewRequest is the doctor payload for POST /reviews/:id/reply.
type ReplyReviewRequest struct {
	Reply string `json:"reply" validate:"required,min=1,max=2000"`
}

// ModerateReviewRequest is the admin payload for PATCH /admin/reviews/:id/status.
type ModerateReviewRequest struct {
	Status string `json:"status" validate:"required,oneof=APPROVED REJECTED PENDING"`
}

// ReviewResponse is the full review DTO for authenticated panels.
type ReviewResponse struct {
	ID              string     `json:"id"`
	AppointmentID   string     `json:"appointment_id"`
	PatientID       string     `json:"patient_id"`
	DoctorID        string     `json:"doctor_id"`
	DoctorProfileID string     `json:"doctor_profile_id,omitempty"`
	Rating          int        `json:"rating"`
	Body            string     `json:"body"`
	Status          string     `json:"status"`
	AuthorInitials  string     `json:"author_initials"`
	DoctorReply     string     `json:"doctor_reply,omitempty"`
	RepliedAt       *time.Time `json:"replied_at,omitempty"`
	HelpfulCount    int        `json:"helpful_count"`
	CreatedAt       time.Time  `json:"created_at"`
	UpdatedAt       time.Time  `json:"updated_at"`
}

// PublicReviewResponse is the sanitized public review card.
type PublicReviewResponse struct {
	ID             string `json:"id"`
	DoctorID       string `json:"doctor_id"`
	AuthorInitials string `json:"author_initials"`
	Date           string `json:"date"`
	Rating         int    `json:"rating"`
	Body           string `json:"body"`
	DoctorReply    string `json:"doctor_reply,omitempty"`
	HelpfulCount   int    `json:"helpful_count"`
}

// RatingSummary is the public aggregate derived from APPROVED reviews only.
type RatingSummary struct {
	Average      float64 `json:"average"`
	Total        int     `json:"total"`
	Distribution [5]int  `json:"distribution"` // index 0 = 1★ … 4 = 5★
}

// PublicReviewsResponse wraps approved reviews + summary for a doctor.
type PublicReviewsResponse struct {
	Summary RatingSummary          `json:"summary"`
	Reviews []*PublicReviewResponse `json:"reviews"`
}
