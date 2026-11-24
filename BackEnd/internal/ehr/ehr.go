// Package ehr implements the Electronic Health Record domain of the clinic
// application.
//
// It owns the MedicalRecord entity, the request/response DTOs used by the HTTP
// layer and the business rules that govern who may read or write a patient's
// clinical notes. Business logic lives in service.go and the HTTP handlers in
// handler.go.
//
// The central privacy rule of this domain is that a medical record carries a
// PrivateNotes field which only the authoring doctor (and admins) may ever see.
// Patients always receive a response whose private notes have been stripped, so
// the ToResponse/ToFullResponse split is enforced at the entity boundary and
// cannot be bypassed by a careless caller.
//
// Per the project's Clean Architecture rules this package lives in `internal/`
// and may import from `pkg/` (and from the sibling `internal/user` domain for
// role constants), while `pkg/` packages MUST NEVER import anything from
// `internal/`.
package ehr

import (
	"context"
	"encoding/json"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// RecordTypeGeneral marks a legacy flat-field (Symptoms/Diagnosis/Prescription)
// medical record. It is the default for records that predate SOAP support.
const RecordTypeGeneral = "GENERAL"

// RecordTypeSOAP marks a structured SOAP (Subjective/Objective/Assessment/
// Plan) medical record.
const RecordTypeSOAP = "SOAP"

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

// MedicalRecord is the persisted representation of a single clinical encounter.
// It maps 1:1 to a document in the "medical_records" MongoDB collection.
//
// A record is anchored to a specific appointment and therefore to a specific
// (patient, doctor, visit) triple. The PrivateNotes field is the only piece of
// data subject to differential visibility: doctors and admins see it through
// ToFullResponse, while patients never do.
type MedicalRecord struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id" json:"id"`
	// PatientID references the user account (role PATIENT) the record belongs
	// to.
	PatientID primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	// DoctorID references the user account (role DOCTOR) who authored the
	// record.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// AppointmentID references the appointment that this record documents.
	AppointmentID primitive.ObjectID `bson:"appointment_id" json:"appointment_id"`
	// Symptoms is the free-text description of the patient's reported symptoms.
	Symptoms string `bson:"symptoms" json:"symptoms"`
	// Diagnosis is the clinician's diagnosis for the encounter.
	Diagnosis string `bson:"diagnosis" json:"diagnosis"`
	// Prescription is the prescribed treatment/medication instructions.
	Prescription string `bson:"prescription" json:"prescription"`
	// PrivateNotes is the doctor's confidential notes that must never be exposed
	// to a patient. It is only carried by the MedicalRecordFullResponse DTO.
	PrivateNotes string `bson:"private_notes" json:"-"`
	// SOAP (Subjective, Objective, Assessment, Plan) fields. These are an
	// optional, structured alternative to the legacy flat Symptoms/Diagnosis/
	// Prescription fields. They are kept side-by-side with the flat fields for
	// backward compatibility with existing clients and documents; the
	// RecordType flag below records which shape the record carries.
	Subjective string `bson:"subjective" json:"subjective"` // S - patient complaints, symptoms narrative
	Objective  string `bson:"objective" json:"objective"`   // O - vitals, physical exam, objective findings
	Assessment string `bson:"assessment" json:"assessment"` // A - diagnosis, clinical impression
	Plan       string `bson:"plan" json:"plan"`             // P - treatment plan, prescription, follow-up
	// RecordType is "GENERAL" for legacy flat-field records or "SOAP" when the
	// structured SOAP fields were supplied at creation. It lets consumers render
	// the appropriate UI without guessing. Defaults to "GENERAL" for documents
	// that predate the SOAP support.
	RecordType string `bson:"record_type" json:"record_type"`
	// CreatedAt is the timestamp the record was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// ToResponse converts the MedicalRecord entity into a MedicalRecordResponse DTO,
// stripping the PrivateNotes field. This is the "patient view" and is the
// default safe shape to send across the service boundary. It returns nil for a
// nil receiver so callers can chain safely.
func (m *MedicalRecord) ToResponse() *MedicalRecordResponse {
	if m == nil {
		return nil
	}
	return &MedicalRecordResponse{
		ID:            m.ID,
		PatientID:     m.PatientID,
		DoctorID:      m.DoctorID,
		AppointmentID: m.AppointmentID,
		Symptoms:      m.Symptoms,
		Diagnosis:     m.Diagnosis,
		Prescription:  m.Prescription,
		Subjective:    m.Subjective,
		Objective:     m.Objective,
		Assessment:    m.Assessment,
		Plan:          m.Plan,
		RecordType:    m.RecordType,
		CreatedAt:     m.CreatedAt,
	}
}

// ToFullResponse converts the MedicalRecord entity into a
// MedicalRecordFullResponse DTO, retaining the PrivateNotes field. This is the
// "doctor/admin view" and must only ever be returned to an authenticated doctor
// or admin. It returns nil for a nil receiver so callers can chain safely.
func (m *MedicalRecord) ToFullResponse() *MedicalRecordFullResponse {
	if m == nil {
		return nil
	}
	return &MedicalRecordFullResponse{
		ID:            m.ID,
		PatientID:     m.PatientID,
		DoctorID:      m.DoctorID,
		AppointmentID: m.AppointmentID,
		Symptoms:      m.Symptoms,
		Diagnosis:     m.Diagnosis,
		Prescription:  m.Prescription,
		Subjective:    m.Subjective,
		Objective:     m.Objective,
		Assessment:    m.Assessment,
		Plan:          m.Plan,
		RecordType:    m.RecordType,
		PrivateNotes:  m.PrivateNotes,
		CreatedAt:     m.CreatedAt,
	}
}

// ---------------------------------------------------------------------------
// Request / Response DTOs
// ---------------------------------------------------------------------------

// CreateMedicalRecordRequest is the payload accepted by POST /medical-records.
// The patient, doctor and appointment ids are hex strings in the DTO and are
// parsed into ObjectIDs in the service. Symptoms and Diagnosis are OPTIONAL: a
// record may instead be authored with the structured SOAP fields. The service
// enforces that at least one clinically meaningful payload is present (either
// the legacy Symptoms/Diagnosis pair or any of the SOAP fields).
type CreateMedicalRecordRequest struct {
	// PatientID is the hex id of the patient the record is about (required).
	PatientID string `json:"patient_id" validate:"required"`
	// DoctorID is the hex id of the doctor authoring the record (required).
	DoctorID string `json:"doctor_id" validate:"required"`
	// AppointmentID is the hex id of the appointment this record documents
	// (required).
	AppointmentID string `json:"appointment_id" validate:"required"`
	// Symptoms is the free-text description of the patient's symptoms. Optional
	// when the record is authored via the SOAP fields.
	Symptoms string `json:"symptoms"`
	// Diagnosis is the clinician's diagnosis for the encounter. Optional when
	// the record is authored via the SOAP fields.
	Diagnosis string `json:"diagnosis"`
	// Prescription is the optional prescribed treatment/medication.
	Prescription string `json:"prescription"`
	// PrivateNotes is the optional confidential notes for doctor/admin eyes only.
	PrivateNotes string `json:"private_notes"`
	// Subjective is the SOAP "S" field: patient complaints / symptoms narrative
	// (optional). When any SOAP field is supplied the record is marked SOAP.
	Subjective string `json:"subjective"`
	// Objective is the SOAP "O" field: vitals, physical exam, objective findings
	// (optional).
	Objective string `json:"objective"`
	// Assessment is the SOAP "A" field: diagnosis / clinical impression
	// (optional).
	Assessment string `json:"assessment"`
	// Plan is the SOAP "P" field: treatment plan, prescription, follow-up
	// (optional).
	Plan string `json:"plan"`
	// CompleteVisit, when true and AppointmentID is set, asks the service to
	// transition the linked appointment to COMPLETED after the record is saved
	// (the SOAP→complete-visit flow).
	CompleteVisit bool `json:"complete_visit"`
}

// MedicalRecordResponse is the patient-facing representation of a medical
// record. It deliberately omits PrivateNotes so that patient access can never
// leak the doctor's confidential notes.
type MedicalRecordResponse struct {
	ID            primitive.ObjectID `json:"id"`
	PatientID     primitive.ObjectID `json:"patient_id"`
	DoctorID      primitive.ObjectID `json:"doctor_id"`
	AppointmentID primitive.ObjectID `json:"appointment_id"`
	Symptoms      string             `json:"symptoms"`
	Diagnosis     string             `json:"diagnosis"`
	Prescription  string             `json:"prescription"`
	Subjective    string             `json:"subjective"`
	Objective     string             `json:"objective"`
	Assessment    string             `json:"assessment"`
	Plan          string             `json:"plan"`
	RecordType    string             `json:"record_type"`
	CreatedAt     time.Time          `json:"created_at"`
}

// MedicalRecordFullResponse is the doctor/admin-facing representation of a
// medical record. It is identical to MedicalRecordResponse except that it also
// carries the PrivateNotes field.
type MedicalRecordFullResponse struct {
	ID            primitive.ObjectID `json:"id"`
	PatientID     primitive.ObjectID `json:"patient_id"`
	DoctorID      primitive.ObjectID `json:"doctor_id"`
	AppointmentID primitive.ObjectID `json:"appointment_id"`
	Symptoms      string             `json:"symptoms"`
	Diagnosis     string             `json:"diagnosis"`
	Prescription  string             `json:"prescription"`
	Subjective    string             `json:"subjective"`
	Objective     string             `json:"objective"`
	Assessment    string             `json:"assessment"`
	Plan          string             `json:"plan"`
	RecordType    string             `json:"record_type"`
	PrivateNotes  string             `json:"private_notes"`
	CreatedAt     time.Time          `json:"created_at"`
}

// ---------------------------------------------------------------------------
// Triage notes
// ---------------------------------------------------------------------------

// Vitals is the structured set of vital signs captured during triage. All
// fields are optional in spirit; a nil pointer means "not measured".
type Vitals struct {
	BloodPressure    string  `bson:"blood_pressure" json:"blood_pressure"` // e.g. "120/80"
	HeartRate        int     `bson:"heart_rate" json:"heart_rate"`
	Temperature      float64 `bson:"temperature" json:"temperature"` // Celsius
	RespiratoryRate  int     `bson:"respiratory_rate" json:"respiratory_rate"`
	OxygenSaturation float64 `bson:"oxygen_saturation" json:"oxygen_saturation"` // SpO2 %
	Weight           float64 `bson:"weight" json:"weight"`                       // kg
	Height           float64 `bson:"height" json:"height"`                       // cm
}

// TriageNote is the persisted representation of a triage assessment taken at
// (or just before) the visit. It maps 1:1 to a document in the "triage_notes"
// MongoDB collection. Unlike a MedicalRecord it is a lightweight,
// nurse/reception-fronted snapshot (symptoms, vitals, free notes) rather than
// the clinician's full SOAP record.
type TriageNote struct {
	// ID is the MongoDB primary key.
	ID primitive.ObjectID `bson:"_id,omitempty" json:"id,omitempty"`
	// PatientID references the user account (role PATIENT) the note belongs to.
	PatientID primitive.ObjectID `bson:"patient_id" json:"patient_id"`
	// DoctorID references the user account (role DOCTOR) the note is associated
	// with.
	DoctorID primitive.ObjectID `bson:"doctor_id" json:"doctor_id"`
	// AppointmentID references the appointment that triggered the triage.
	AppointmentID primitive.ObjectID `bson:"appointment_id" json:"appointment_id"`
	// Symptoms is the list of reported symptoms, e.g. ["fever","headache"].
	Symptoms []string `bson:"symptoms" json:"symptoms"`
	// Vitals holds the measured vital signs; nil when none were captured.
	Vitals *Vitals `bson:"vitals,omitempty" json:"vitals,omitempty"`
	// Notes is the free-text triage narrative.
	Notes string `bson:"notes" json:"notes"`
	// CreatedAt is the timestamp the note was first persisted.
	CreatedAt time.Time `bson:"created_at" json:"created_at"`
}

// ToResponse converts the TriageNote entity into a TriageNoteResponse DTO,
// turning the embedded ObjectIDs into hex strings for JSON transport. It
// returns nil for a nil receiver so callers can chain safely.
func (t *TriageNote) ToResponse() *TriageNoteResponse {
	if t == nil {
		return nil
	}
	return &TriageNoteResponse{
		ID:            t.ID.Hex(),
		PatientID:     t.PatientID.Hex(),
		DoctorID:      t.DoctorID.Hex(),
		AppointmentID: t.AppointmentID.Hex(),
		Symptoms:      t.Symptoms,
		Vitals:        t.Vitals,
		Notes:         t.Notes,
		CreatedAt:     t.CreatedAt,
	}
}

// CreateTriageNoteRequest is the payload accepted by POST /triage. The three
// reference ids are hex strings in the DTO and are parsed into ObjectIDs in the
// service.
type CreateTriageNoteRequest struct {
	PatientID     string   `json:"patient_id" validate:"required"`
	DoctorID      string   `json:"doctor_id" validate:"required"`
	AppointmentID string   `json:"appointment_id" validate:"required"`
	Symptoms      []string `json:"symptoms"`
	Vitals        *Vitals  `json:"vitals"`
	Notes         string   `json:"notes"`
}

// TriageNoteResponse is the API-facing representation of a TriageNote. It uses
// hex string ids rather than ObjectIDs so the payload is JSON-friendly.
type TriageNoteResponse struct {
	ID            string    `json:"id"`
	PatientID     string    `json:"patient_id"`
	DoctorID      string    `json:"doctor_id"`
	AppointmentID string    `json:"appointment_id"`
	Symptoms      []string  `json:"symptoms"`
	Vitals        *Vitals   `json:"vitals,omitempty"`
	Notes         string    `json:"notes"`
	CreatedAt     time.Time `json:"created_at"`
}

// ---------------------------------------------------------------------------
// Doctor "My Patients" directory
// ---------------------------------------------------------------------------

// PatientVisitLookup exposes the minimal appointment facts the patient
// directory needs. Implemented by a bootstrap adapter over the booking
// appointments collection; depending on this tiny surface (rather than the
// whole booking domain) keeps the EHR package free of a booking import,
// preserving the Clean-Architecture dependency direction. It is the
// booking→ehr analogue of the BookingCompleter interface.
type PatientVisitLookup interface {
	// ListVisitsByDoctor returns the visit facts (patient, start time, raw
	// status string) for every appointment the given doctor has, in the
	// statuses the directory counts. The service filters/aggregates further.
	ListVisitsByDoctor(ctx context.Context, doctorID primitive.ObjectID) ([]VisitFact, error)
}

// VisitFact is the minimal appointment projection carried across the
// PatientVisitLookup boundary.
type VisitFact struct {
	// PatientID is the user id of the patient the appointment belongs to.
	PatientID primitive.ObjectID
	// StartTime is the inclusive beginning of the appointment slot.
	StartTime time.Time
	// Status is the raw booking status string (e.g. "CONFIRMED", "COMPLETED").
	Status string
}

// PatientInfoReader exposes the demographic fields for a single patient.
// Implemented by a bootstrap adapter over the users collection; it lets the
// EHR domain read a patient's name/phone/national code without importing
// internal/user.
type PatientInfoReader interface {
	// GetPatientInfo returns the demographic projection for the given patient
	// id. An error (e.g. the user was deleted) is surfaced so the caller can
	// skip that patient rather than failing the whole directory listing.
	GetPatientInfo(ctx context.Context, patientID primitive.ObjectID) (PatientInfo, error)
}

// PatientInfo is the demographic projection carried across the
// PatientInfoReader boundary.
type PatientInfo struct {
	// FirstName is the patient's given name.
	FirstName string
	// LastName is the patient's family name.
	LastName string
	// Phone is the patient's contact phone number.
	Phone string
	// NationalCode is the patient's national identification code.
	NationalCode string
}

// DoctorPatientSummary is a single row of the doctor's "My Patients"
// directory: a per-patient aggregate of the doctor's appointments with that
// patient, plus the latest diagnosis text. It is serialized to JSON via a
// custom MarshalJSON that emits PatientID as a hex string and LastVisit as an
// RFC3339 string (null when nil), rather than relying on the codebase's
// default ObjectID/time marshaling, so the frontend can consume plain
// strings.
type DoctorPatientSummary struct {
	// PatientID is the user id of the patient.
	PatientID primitive.ObjectID
	// FirstName is the patient's given name.
	FirstName string
	// LastName is the patient's family name.
	LastName string
	// Phone is the patient's contact phone number.
	Phone string
	// NationalCode is the patient's national identification code.
	NationalCode string
	// TotalVisits is the number of the doctor's appointments for the patient
	// whose status is one of CONFIRMED, CHECKED_IN, IN_PROGRESS, COMPLETED.
	TotalVisits int
	// CompletedVisits is the subset of TotalVisits whose status is COMPLETED.
	CompletedVisits int
	// LastVisit is the latest StartTime among the counted appointments, or nil
	// when there are none.
	LastVisit *time.Time
	// LastDiagnosis is the diagnosis (if GENERAL) or assessment (if SOAP) of
	// the doctor's most recent medical record for the patient; empty string
	// when there is no record.
	LastDiagnosis string
}

// MarshalJSON serializes a DoctorPatientSummary with PatientID emitted as a
// hex string and LastVisit emitted as an RFC3339 string (null when nil). This
// keeps the frontend free of ObjectID-aware parsing while the service still
// works with typed ObjectIDs internally.
func (d DoctorPatientSummary) MarshalJSON() ([]byte, error) {
	type alias struct {
		PatientID       string  `json:"patient_id"`
		FirstName       string  `json:"first_name"`
		LastName        string  `json:"last_name"`
		Phone           string  `json:"phone"`
		NationalCode    string  `json:"national_code"`
		TotalVisits     int     `json:"total_visits"`
		CompletedVisits int     `json:"completed_visits"`
		LastVisit       *string `json:"last_visit"`
		LastDiagnosis   string  `json:"last_diagnosis"`
	}

	a := alias{
		PatientID:       d.PatientID.Hex(),
		FirstName:       d.FirstName,
		LastName:        d.LastName,
		Phone:           d.Phone,
		NationalCode:    d.NationalCode,
		TotalVisits:     d.TotalVisits,
		CompletedVisits: d.CompletedVisits,
		LastVisit:       nil,
		LastDiagnosis:   d.LastDiagnosis,
	}
	if d.LastVisit != nil {
		s := d.LastVisit.UTC().Format(time.RFC3339)
		a.LastVisit = &s
	}
	return json.Marshal(a)
}
