// Package user implements the user domain of the clinic application.
//
// It owns the User entity, the request/response DTOs used by the HTTP layer,
// and the role enum that drives RBAC across the system. Business logic lives
// in service.go and the HTTP handlers in handler.go.
//
// Per the project's Clean Architecture rules this package lives in
// `internal/` and may import from `pkg/`, while `pkg/` packages MUST NEVER
// import anything from `internal/`.
package user

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// Role is the authorization role assigned to a user. It is a typed string so
// the compiler can catch typos while still serializing cleanly to/from JSON
// and BSON as plain strings.
type Role string

const (
	// RoleAdmin is the clinic manager with full access to the system.
	RoleAdmin = Role("ADMIN")
	// RoleDoctor can manage their schedule and write medical records.
	RoleDoctor = Role("DOCTOR")
	// RoleReceptionist manages the waiting room and walk-in patients.
	RoleReceptionist = Role("RECEPTIONIST")
	// RolePatient can book appointments and view their own EHR.
	RolePatient = Role("PATIENT")
)

// IsValid reports whether r is one of the recognized roles. It is used during
// registration to reject unknown roles before they are persisted.
func (r Role) IsValid() bool {
	switch r {
	case RoleAdmin, RoleDoctor, RoleReceptionist, RolePatient:
		return true
	default:
		return false
	}
}

// User is the persisted representation of an application user. It maps 1:1 to
// a document in the "users" MongoDB collection.
//
// PasswordHash is intentionally never serialized to JSON (`json:"-"`) so it
// cannot leak out through any API response.
type User struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// Phone is the unique phone number (used for notifications and, for
	// patients, as the OTP login identifier).
	Phone string `bson:"phone" json:"phone"`
	// Username is the login identifier for STAFF accounts
	// (ADMIN/DOCTOR/RECEPTIONIST). Patients authenticate exclusively via OTP and
	// never set a username, so it is left empty for PATIENT accounts. It is
	// persisted with a uniqueness constraint among non-empty values (see the
	// partial index created during bootstrap).
	Username string `bson:"username" json:"username,omitempty"`
	// PasswordHash stores the bcrypt hash of the user's password.
	PasswordHash string `bson:"password_hash" json:"-"`
	// Role determines what the user is allowed to do in the system.
	Role Role `bson:"role" json:"role"`
	// FirstName is the user's given name.
	FirstName string `bson:"first_name" json:"first_name"`
	// LastName is the user's family name.
	LastName string `bson:"last_name" json:"last_name"`
	// NationalCode is the user's national identification code.
	NationalCode string `bson:"national_code" json:"national_code"`
	// CreatedAt is the timestamp the user record was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent modification.
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
	// EmployerID scopes a subordinate account to a DOCTOR user id:
	//   - RECEPTIONIST: the doctor whose schedule/bookings they may manage
	//   - PATIENT: the primary doctor this patient is assigned to (admin/
	//     clinic-managed roster). Public OTP self-registration leaves this
	//     unset (NilObjectID) until an admin assigns the patient.
	// For ADMIN/DOCTOR accounts it is left as primitive.NilObjectID.
	EmployerID primitive.ObjectID `bson:"employer_id" json:"employer_id,omitempty"`
	// RosterExcludedDoctorIDs lists doctor USER ids whose admin patient roster
	// should hide this PATIENT even if appointments still exist (soft unlink
	// from a single doctor without deleting the account).
	RosterExcludedDoctorIDs []primitive.ObjectID `bson:"roster_excluded_doctor_ids,omitempty" json:"-"`
}

// ToResponse converts the User entity into a UserResponse DTO, stripping out
// any sensitive fields (such as the password hash) before it crosses the
// service boundary towards the HTTP layer.
func (u *User) ToResponse() *UserResponse {
	if u == nil {
		return nil
	}
	return &UserResponse{
		ID:           u.ID,
		Phone:        u.Phone,
		Username:     u.Username,
		Role:         u.Role,
		FirstName:    u.FirstName,
		LastName:     u.LastName,
		NationalCode: u.NationalCode,
		EmployerID:   u.EmployerID,
	}
}

// RegisterRequest is the payload accepted by the public POST /auth/register
// endpoint. The validate tags are interpreted by go-playground/validator
// (registered as the Echo validator during bootstrap) and enforce input
// correctness before any business logic runs.
//
// NOTE: the Role field is intentionally NOT validated here and is IGNORED by
// the service. Public registration is hardcoded to the PATIENT role to prevent
// privilege escalation; privileged accounts (DOCTOR/ADMIN/RECEPTIONIST) are
// created through the dedicated admin/doctor staff-creation endpoints.
type RegisterRequest struct {
	// Phone is required and must be a non-empty string (used as login).
	Phone string `json:"phone" validate:"required"`
	// Password is required; bcrypt hashing happens in the service layer.
	Password string `json:"password" validate:"required,min=6"`
	// Role is intentionally ignored for public registration (hardcoded to
	// PATIENT in the service). It is kept in the struct purely for backwards
	// compatibility with older clients that may still send it.
	Role Role `json:"role,omitempty"`
	// FirstName is required.
	FirstName string `json:"first_name" validate:"required"`
	// LastName is required.
	LastName string `json:"last_name" validate:"required"`
	// NationalCode is required.
	NationalCode string `json:"national_code" validate:"required"`
}

// CreateStaffRequest is the payload accepted by a DOCTOR when creating a
// RECEPTIONIST scoped to themselves. It intentionally omits the role — the
// service always assigns RoleReceptionist and wires EmployerID to the calling
// doctor's id.
type CreateStaffRequest struct {
	// Phone is required and must be unique across the users collection.
	Phone string `json:"phone" validate:"required"`
	// Username is the login identifier the new receptionist will use. It must be
	// unique across the users collection (staff authenticate by username).
	Username string `json:"username" validate:"required,min=3"`
	// Password is required; bcrypt hashing happens in the service layer.
	Password string `json:"password" validate:"required,min=6"`
	// FirstName is required.
	FirstName string `json:"first_name" validate:"required"`
	// LastName is required.
	LastName string `json:"last_name" validate:"required"`
	// NationalCode is required.
	NationalCode string `json:"national_code" validate:"required"`
}

// CreatePatientRequest is the payload accepted when an ADMIN creates a PATIENT
// account scoped to a specific doctor. Patients authenticate via OTP, so no
// password or username is collected here. The service always assigns
// RolePatient and wires EmployerID to the target doctor's user id.
type CreatePatientRequest struct {
	// Phone is required and must be unique across the users collection.
	Phone string `json:"phone" validate:"required"`
	// FirstName is required.
	FirstName string `json:"first_name" validate:"required"`
	// LastName is required.
	LastName string `json:"last_name" validate:"required"`
	// NationalCode is required.
	NationalCode string `json:"national_code" validate:"required"`
}

// UpdatePatientRequest is the payload accepted when an ADMIN updates a PATIENT
// scoped to a doctor. All identity fields are required so the form can be
// round-tripped cleanly from the admin UI.
type UpdatePatientRequest struct {
	// Phone is required and must remain unique across the users collection.
	Phone string `json:"phone" validate:"required"`
	// FirstName is required.
	FirstName string `json:"first_name" validate:"required"`
	// LastName is required.
	LastName string `json:"last_name" validate:"required"`
	// NationalCode is required.
	NationalCode string `json:"national_code" validate:"required"`
}

// UpdateStaffRequest is the payload accepted when updating a RECEPTIONIST
// scoped to a doctor. Password is optional: an empty value leaves the existing
// hash unchanged.
type UpdateStaffRequest struct {
	// Phone is required and must remain unique across the users collection.
	Phone string `json:"phone" validate:"required"`
	// Username is the login identifier; must remain unique among staff.
	Username string `json:"username" validate:"required,min=3"`
	// Password is optional; when non-empty it replaces the stored hash.
	Password string `json:"password,omitempty" validate:"omitempty,min=6"`
	// FirstName is required.
	FirstName string `json:"first_name" validate:"required"`
	// LastName is required.
	LastName string `json:"last_name" validate:"required"`
	// NationalCode is required.
	NationalCode string `json:"national_code" validate:"required"`
}

// CreateDoctorRequest is the payload accepted by the ADMIN endpoint that
// creates either a DOCTOR or an ADMIN. The Role field is validated to be one
// of those two privileged roles only — an admin may NOT create patients or
// receptionists through this endpoint.
type CreateDoctorRequest struct {
	// Phone is required and must be unique across the users collection.
	Phone string `json:"phone" validate:"required"`
	// Username is the login identifier the new staff member will use. It must be
	// unique across the users collection (staff authenticate by username).
	Username string `json:"username" validate:"required,min=3"`
	// Password is required; bcrypt hashing happens in the service layer.
	Password string `json:"password" validate:"required,min=6"`
	// Role must be DOCTOR or ADMIN — the only roles an admin can mint here.
	Role Role `json:"role" validate:"required,oneof=DOCTOR ADMIN"`
	// FirstName is required.
	FirstName string `json:"first_name" validate:"required"`
	// LastName is required.
	LastName string `json:"last_name" validate:"required"`
	// NationalCode is required.
	NationalCode string `json:"national_code" validate:"required"`
}

// LoginRequest is the payload accepted by the POST /login endpoint.
//
// Staff (ADMIN/DOCTOR/RECEPTIONIST) authenticate exclusively with a username +
// password. The Username field carries that identifier; for backward
// compatibility with accounts created before usernames existed, the service
// also accepts the user's phone number as the identifier.
type LoginRequest struct {
	// Username identifies the staff account attempting to authenticate. A phone
	// number is also accepted for backward compatibility.
	Username string `json:"username" validate:"required"`
	// Password is the plaintext credential verified against the stored hash.
	Password string `json:"password" validate:"required"`
}

// UserResponse is the sanitized view of a User returned by read endpoints.
// It never contains the password hash.
type UserResponse struct {
	ID    primitive.ObjectID `json:"id"`
	Phone string             `json:"phone"`
	// Username is the login identifier of staff accounts. Empty for PATIENT
	// accounts (they authenticate via OTP), so it is omitted from their JSON.
	Username     string `json:"username,omitempty"`
	Role         Role   `json:"role"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	NationalCode string `json:"national_code"`
	// EmployerID mirrors the entity field: present for RECEPTIONIST and for
	// PATIENT accounts assigned to a doctor; omitted when unset.
	EmployerID primitive.ObjectID `json:"employer_id,omitempty"`
}

// LoginResponse is returned by a successful authentication: it carries the
// freshly minted JWT alongside the authenticated user's public profile.
type LoginResponse struct {
	// Token is the signed JWT to send as "Authorization: Bearer <token>".
	Token string `json:"token"`
	// User is the public profile of the authenticated account.
	User *UserResponse `json:"user"`
}
