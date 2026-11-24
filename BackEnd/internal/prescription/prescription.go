// Package prescription implements the Prescription Management domain of the
// clinic application.
//
// It owns the Prescription entity (a clinician-issued medication order anchored
// to a patient and, optionally, an appointment/medical record), the
// request/response DTOs used by the HTTP layer and the business rules that
// govern who may create, read or transition a prescription. Business logic
// lives in service.go and the HTTP handlers in handler.go.
//
// The central privacy rule of this domain is that a prescription carries a
// Notes field (free-text clinical context) which only the authoring doctor
// (and admins) may ever see through ToFullResponse, while patients receive the
// ToResponse shape that strips it. The split is enforced at the entity boundary
// and cannot be bypassed by a careless caller.
//
// Per the project's Clean Architecture rules this package lives in `internal/`
// and may import from `pkg/` (and from the sibling `internal/user` domain for
// role constants), while `pkg/` packages MUST NEVER import anything from
// `internal/`.
package prescription

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// ---------------------------------------------------------------------------
// Status enum
// ---------------------------------------------------------------------------

// Status is the lifecycle state of a prescription. It is a typed string enum so
// that the valid values are auditable at the call site while remaining JSON /
// bson friendly.
type Status string

const (
	// StatusActive marks a prescription that is currently in force.
	StatusActive = Status("ACTIVE")
	// StatusCompleted marks a prescription whose course has run to completion.
	StatusCompleted = Status("COMPLETED")
	// StatusCancelled marks a prescription that was revoked before completion.
	StatusCancelled = Status("CANCELLED")
)

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

// PrescriptionItem captures a single drug line on a prescription (drug name,
// RxNorm CUI, dose, frequency, duration, sig instructions and dispense
// quantity). It is embedded as a sub-document inside a Prescription.
type PrescriptionItem struct {
	// DrugName is the human-readable drug name.
	DrugName string `bson:"drug_name" json:"drug_name"`
	// RxCUI is the RxNorm Concept Unique Identifier for the drug (may be empty
	// when the drug was entered freehand).
	RxCUI string `bson:"rxcui" json:"rxcui"`
	// Dose is the strength/amount per administration, e.g. "500mg".
	Dose string `bson:"dose" json:"dose"`
	// Frequency is how often the drug is taken, e.g. "BID" or "twice daily".
	Frequency string `bson:"frequency" json:"frequency"`
	// Duration is how long the course runs, e.g. "7 days".
	Duration string `bson:"duration" json:"duration"`
	// Sig is the free-text patient instructions ("take with food", etc.).
	Sig string `bson:"sig" json:"sig"`
	// Quantity is the dispense quantity, e.g. "30 tablets". Optional.
	Quantity string `bson:"quantity,omitempty" json:"quantity,omitempty"`
}

// Prescription is the persisted representation of a clinician-issued medication
// order. It maps 1:1 to a document in the "prescriptions" MongoDB collection.
//
// A prescription is anchored to a patient and the authoring doctor, and may be
// optionally linked to the appointment and/or medical record that triggered it.
// The Notes field is the only piece of data subject to differential visibility:
// doctors and admins see it through ToFullResponse, while patients never do.
type Prescription struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// PatientID references the user account (role PATIENT) the prescription
	// belongs to.
	PatientID primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	// DoctorID references the user account (role DOCTOR) who issued the
	// prescription.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// AppointmentID optionally references the appointment that triggered the
	// prescription.
	AppointmentID primitive.ObjectID `bson:"appointment_id,omitempty" json:"appointment_id,omitempty"`
	// MedicalRecordID optionally references the medical record the prescription
	// is attached to (the EHR cross-link).
	MedicalRecordID primitive.ObjectID `bson:"medical_record_id,omitempty" json:"medical_record_id,omitempty"`
	// Items is the ordered list of prescribed drugs.
	Items []PrescriptionItem `bson:"items" json:"items"`
	// Notes is the doctor's free-text clinical context for the prescription.
	// It must never be exposed to a patient; it is only carried by the
	// PrescriptionFullResponse DTO.
	Notes string `bson:"notes,omitempty" json:"-"`
	// Status is the lifecycle state of the prescription.
	Status Status `bson:"status" json:"status"`
	// CreatedAt is the timestamp the prescription was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
	// UpdatedAt is the timestamp of the most recent mutation (status change).
	UpdatedAt time.Time `bson:"updated_at" json:"updated_at"`
}

// ToResponse converts the Prescription entity into a PrescriptionResponse DTO,
// stripping the Notes field. This is the "patient view" and is the default safe
// shape to send across the service boundary. It returns nil for a nil receiver
// so callers can chain safely.
func (p *Prescription) ToResponse() *PrescriptionResponse {
	if p == nil {
		return nil
	}
	return &PrescriptionResponse{
		ID:              p.ID,
		PatientID:       p.PatientID,
		DoctorID:        p.DoctorID,
		AppointmentID:   p.AppointmentID,
		MedicalRecordID: p.MedicalRecordID,
		Items:           p.Items,
		Status:          p.Status,
		CreatedAt:       p.CreatedAt,
		UpdatedAt:       p.UpdatedAt,
	}
}

// ToFullResponse converts the Prescription entity into a PrescriptionFullResponse
// DTO, retaining the Notes field. This is the "doctor/admin view" and must only
// ever be returned to an authenticated doctor or admin. It returns nil for a nil
// receiver so callers can chain safely.
func (p *Prescription) ToFullResponse() *PrescriptionFullResponse {
	if p == nil {
		return nil
	}
	return &PrescriptionFullResponse{
		ID:              p.ID,
		PatientID:       p.PatientID,
		DoctorID:        p.DoctorID,
		AppointmentID:   p.AppointmentID,
		MedicalRecordID: p.MedicalRecordID,
		Items:           p.Items,
		Notes:           p.Notes,
		Status:          p.Status,
		CreatedAt:       p.CreatedAt,
		UpdatedAt:       p.UpdatedAt,
	}
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

// CreatePrescriptionItemRequest is the payload for a single drug line when
// creating a prescription. It mirrors the PrescriptionItem fields as plain
// strings so it is JSON-friendly; the service maps it onto a PrescriptionItem.
type CreatePrescriptionItemRequest struct {
	// DrugName is the human-readable drug name (required).
	DrugName string `json:"drug_name" validate:"required"`
	// RxCUI is the optional RxNorm CUI.
	RxCUI string `json:"rxcui"`
	// Dose is the strength/amount per administration.
	Dose string `json:"dose"`
	// Frequency is how often the drug is taken.
	Frequency string `json:"frequency"`
	// Duration is how long the course runs.
	Duration string `json:"duration"`
	// Sig is the free-text patient instructions.
	Sig string `json:"sig"`
	// Quantity is the optional dispense quantity.
	Quantity string `json:"quantity"`
}

// CreatePrescriptionRequest is the payload accepted by POST /prescriptions.
// The patient id is a required 24-char hex string; the appointment and medical
// record ids are optional hex strings. At least one drug item must be supplied.
// NotifyPatient, when true, asks the service to fan out a best-effort
// notification to the patient.
type CreatePrescriptionRequest struct {
	// PatientID is the hex id of the patient the prescription is for (required).
	PatientID string `json:"patient_id" validate:"required,len=24"`
	// AppointmentID is the optional hex id of the triggering appointment.
	AppointmentID string `json:"appointment_id"`
	// MedicalRecordID is the optional hex id of the linked medical record; when
	// set the service cross-links the prescription back onto the EHR.
	MedicalRecordID string `json:"medical_record_id"`
	// Items is the non-empty list of prescribed drugs.
	Items []CreatePrescriptionItemRequest `json:"items" validate:"required,min=1,dive"`
	// Notes is the optional doctor-only clinical context (never shown to
	// patients).
	Notes string `json:"notes"`
	// NotifyPatient, when true, triggers a best-effort patient notification.
	NotifyPatient bool `json:"notify_patient"`
}

// UpdatePrescriptionStatusRequest is the payload accepted by PATCH
// /prescriptions/:id/status.
type UpdatePrescriptionStatusRequest struct {
	// Status is the target lifecycle state (one of ACTIVE, COMPLETED,
	// CANCELLED).
	Status string `json:"status" validate:"required,oneof=ACTIVE COMPLETED CANCELLED"`
}

// PrescriptionResponse is the patient-facing representation of a prescription.
// It deliberately omits Notes so that patient access can never leak the doctor's
// clinical context.
type PrescriptionResponse struct {
	ID              primitive.ObjectID `json:"id"`
	PatientID       primitive.ObjectID `json:"patient_id"`
	DoctorID        primitive.ObjectID `json:"doctor_id"`
	AppointmentID   primitive.ObjectID `json:"appointment_id,omitempty"`
	MedicalRecordID primitive.ObjectID `json:"medical_record_id,omitempty"`
	Items           []PrescriptionItem `json:"items"`
	Status          Status             `json:"status"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
	// PatientName is the denormalized display name of the patient, resolved
	// from the users collection at read time (empty when unavailable).
	PatientName string `json:"patient_name,omitempty"`
	// DoctorName is the denormalized display name of the issuing doctor.
	DoctorName string `json:"doctor_name,omitempty"`
}

// PrescriptionFullResponse is the doctor/admin-facing representation of a
// prescription. It is identical to PrescriptionResponse except that it also
// carries the Notes field.
type PrescriptionFullResponse struct {
	ID              primitive.ObjectID `json:"id"`
	PatientID       primitive.ObjectID `json:"patient_id"`
	DoctorID        primitive.ObjectID `json:"doctor_id"`
	AppointmentID   primitive.ObjectID `json:"appointment_id,omitempty"`
	MedicalRecordID primitive.ObjectID `json:"medical_record_id,omitempty"`
	Items           []PrescriptionItem `json:"items"`
	Notes           string             `json:"notes"`
	Status          Status             `json:"status"`
	CreatedAt       time.Time          `json:"created_at"`
	UpdatedAt       time.Time          `json:"updated_at"`
	// PatientName is the denormalized display name of the patient, resolved
	// from the users collection at read time (empty when unavailable).
	PatientName string `json:"patient_name,omitempty"`
	// DoctorName is the denormalized display name of the issuing doctor.
	DoctorName string `json:"doctor_name,omitempty"`
}
