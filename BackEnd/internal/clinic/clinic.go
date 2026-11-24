// Package clinic implements the clinic domain of the clinic application.
//
// It owns the Branch and DoctorProfile entities, the request/response DTOs
// used by the HTTP layer, and the business rules that govern them. Business
// logic lives in service.go and the HTTP handlers in handler.go.
//
// Per the project's Clean Architecture rules this package lives in
// `internal/` and may import from `pkg/`, while `pkg/` packages MUST NEVER
// import anything from `internal/`.
package clinic

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// UserInfo is the minimal user-identity projection the clinic domain needs to
// enrich doctor-profile responses. It deliberately lives in the clinic domain
// (not the user domain) so clinic never imports internal/user, preserving the
// Clean Architecture dependency direction. The bootstrap layer implements a
// UserReader (see cmd/clinic-api/bootstrap) that produces these from the real
// users repository.
type UserInfo struct {
	// ID is the MongoDB primary key of the user.
	ID primitive.ObjectID
	// FirstName is the user's given name.
	FirstName string
	// LastName is the user's family name.
	LastName string
	// Phone is the user's unique login phone number.
	Phone string
	// NationalCode is the user's national identification code.
	NationalCode string
}

// UserReader supplies user-identity projections for doctor profiles without the
// clinic domain importing internal/user. It is implemented in the bootstrap
// layer using the generic users repository, mirroring the cross-domain adapter
// pattern already used by the finance billing adapter.
type UserReader interface {
	// GetByID returns the user identified by id. A missing user is reported as
	// database.ErrNotFound so callers can decide whether to tolerate it.
	GetByID(ctx context.Context, id primitive.ObjectID) (*UserInfo, error)
	// FindByIDs returns the users matching the given ids, keyed by id. Unknown
	// ids are simply absent from the map (no error), which makes batch
	// enrichment resilient to partial data.
	FindByIDs(ctx context.Context, ids []primitive.ObjectID) (map[primitive.ObjectID]*UserInfo, error)
	// CountReceptionistsByEmployerIDs returns receptionist counts keyed by
	// doctor USER id (employer_id). Missing ids should be present as 0.
	CountReceptionistsByEmployerIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error)
	// CountPatientsByDoctorIDs returns patient roster counts keyed by doctor
	// USER id, matching ListPatients semantics (employer + appointments −
	// roster exclusions). Missing ids should be present as 0.
	CountPatientsByDoctorIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error)
}

// Branch is the persisted representation of a physical clinic location. It
// maps 1:1 to a document in the "branches" MongoDB collection.
type Branch struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// Name is the human-friendly label of the branch (e.g. "Downtown Clinic").
	Name string `bson:"name" json:"name"`
	// Address is the postal/street address of the branch.
	Address string `bson:"address" json:"address"`
	// Contact is the primary contact line (e.g. phone number) for the branch.
	Contact string `bson:"contact" json:"contact"`
	// CreatedAt is the timestamp the branch record was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent modification.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the Branch entity into a BranchResponse DTO. It returns
// nil for a nil receiver so callers can chain safely.
func (b *Branch) ToResponse() *BranchResponse {
	if b == nil {
		return nil
	}
	return &BranchResponse{
		ID:      b.ID,
		Name:    b.Name,
		Address: b.Address,
		Contact: b.Contact,
	}
}

// DoctorProfile is the persisted representation of a doctor's professional
// profile, linked to a user account (of role DOCTOR) via UserID. It maps 1:1
// to a document in the "doctor_profiles" MongoDB collection.
type DoctorProfile struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// UserID references the associated user account (role DOCTOR).
	UserID primitive.ObjectID `bson:"user_id" json:"user_id"`
	// Specialty is the medical specialty (e.g. "Cardiology").
	Specialty string `bson:"specialty" json:"specialty"`
	// MedicalSystemNumber is the practitioner's official medical-system code.
	MedicalSystemNumber string `bson:"medical_system_number" json:"medical_system_number"`
	// VisitDurationMinutes is the default length, in minutes, of a single visit.
	VisitDurationMinutes int `bson:"visit_duration_minutes" json:"visit_duration_minutes"`
	// VisitFee is the fee (in the smallest displayed currency unit, e.g. Toman)
	// charged for a single visit. Defaults to 0 for legacy profiles; surfaced to
	// patients during discovery/booking.
	VisitFee int `bson:"visit_fee" json:"visit_fee"`
	// CreatedAt is the timestamp the profile was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent modification.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the DoctorProfile entity into a DoctorProfileResponse DTO.
// It returns nil for a nil receiver so callers can chain safely.
func (d *DoctorProfile) ToResponse() *DoctorProfileResponse {
	if d == nil {
		return nil
	}
	return &DoctorProfileResponse{
		ID:                   d.ID,
		UserID:               d.UserID,
		Specialty:            d.Specialty,
		MedicalSystemNumber:  d.MedicalSystemNumber,
		VisitDurationMinutes: d.VisitDurationMinutes,
		VisitFee:             d.VisitFee,
	}
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

// CreateBranchRequest is the payload accepted by POST /branches. The validate
// tags are interpreted by go-playground/validator (registered as the Echo
// validator during bootstrap) and enforce input correctness before any
// business logic runs.
type CreateBranchRequest struct {
	// Name is required.
	Name string `json:"name" validate:"required"`
	// Address is required.
	Address string `json:"address" validate:"required"`
	// Contact is required.
	Contact string `json:"contact" validate:"required"`
}

// UpdateBranchRequest is the payload accepted by PUT /branches/:id. Fields are
// required so the validator enforces a full replacement on update.
type UpdateBranchRequest struct {
	// Name is required.
	Name string `json:"name" validate:"required"`
	// Address is required.
	Address string `json:"address" validate:"required"`
	// Contact is required.
	Contact string `json:"contact" validate:"required"`
}

// BranchResponse is the sanitized view of a Branch returned by read endpoints.
type BranchResponse struct {
	ID      primitive.ObjectID `json:"id"`
	Name    string             `json:"name"`
	Address string             `json:"address"`
	Contact string             `json:"contact"`
}

// CreateDoctorProfileRequest is the payload accepted by POST /doctors. UserID
// is a hex string in the DTO and is parsed into an ObjectID in the service.
type CreateDoctorProfileRequest struct {
	// UserID is the hex id of the associated user account (required).
	UserID string `json:"user_id" validate:"required"`
	// Specialty is required.
	Specialty string `json:"specialty" validate:"required"`
	// MedicalSystemNumber is required.
	MedicalSystemNumber string `json:"medical_system_number" validate:"required"`
	// VisitDurationMinutes is required and must be greater than zero.
	VisitDurationMinutes int `json:"visit_duration_minutes" validate:"required,gt=0"`
	// VisitFee is the fee charged for a single visit, in the smallest displayed
	// currency unit (e.g. Toman). Required and must be greater than zero so
	// appointments are always billable.
	VisitFee int `json:"visit_fee" validate:"required,gt=0"`
}

// UpdateDoctorProfileRequest is the payload accepted by PUT /doctors/:id.
type UpdateDoctorProfileRequest struct {
	// Specialty is required.
	Specialty string `json:"specialty" validate:"required"`
	// MedicalSystemNumber is required.
	MedicalSystemNumber string `json:"medical_system_number" validate:"required"`
	// VisitDurationMinutes is required and must be greater than zero.
	VisitDurationMinutes int `json:"visit_duration_minutes" validate:"required,gt=0"`
	// VisitFee is the fee charged for a single visit, in the smallest displayed
	// currency unit (e.g. Toman). Required and must be greater than zero so
	// appointments are always billable.
	VisitFee int `json:"visit_fee" validate:"required,gt=0"`
}

// UpdateMyProfileRequest is the payload accepted by PUT /v1/doctor/profile, the
// self-service endpoint a signed-in DOCTOR uses to edit their OWN pricing
// settings. It intentionally exposes only the fields a doctor is allowed to
// manage about themselves (visit fee and default visit duration); identity and
// specialty/medical-system fields stay admin-controlled.
type UpdateMyProfileRequest struct {
	// VisitDurationMinutes is required and must be greater than zero.
	VisitDurationMinutes int `json:"visit_duration_minutes" validate:"required,gt=0"`
	// VisitFee is the fee charged for a single visit, in the smallest displayed
	// currency unit (e.g. Toman). Required and must be greater than zero so
	// appointments are always billable.
	VisitFee int `json:"visit_fee" validate:"required,gt=0"`
}

// DoctorProfileResponse is the sanitized view of a DoctorProfile returned by
// read endpoints. The denormalized user-identity fields (FirstName, LastName,
// Phone, NationalCode) are filled in by the service layer via the injected
// UserReader so admin-facing listings can display a doctor's name/phone without
// a second round-trip per row on the client.
type DoctorProfileResponse struct {
	ID                   primitive.ObjectID `json:"id"`
	UserID               primitive.ObjectID `json:"user_id"`
	Specialty            string             `json:"specialty"`
	MedicalSystemNumber  string             `json:"medical_system_number"`
	VisitDurationMinutes int                `json:"visit_duration_minutes"`
	// VisitFee is the visit fee in the smallest displayed currency unit.
	VisitFee int `json:"visit_fee"`
	// FirstName is denormalized from the linked user (populated by the service).
	FirstName string `json:"first_name"`
	// LastName is denormalized from the linked user (populated by the service).
	LastName string `json:"last_name"`
	// Phone is denormalized from the linked user (populated by the service).
	Phone string `json:"phone"`
	// NationalCode is denormalized from the linked user (populated by the service).
	NationalCode string `json:"national_code"`
	// PatientCount is the number of patients on this doctor's admin roster
	// (employer-linked + appointment-linked − exclusions). Populated on list.
	PatientCount int `json:"patient_count"`
	// ReceptionistCount is the number of receptionists with employer_id equal
	// to this doctor's user id. Populated on list.
	ReceptionistCount int `json:"receptionist_count"`
}
