package ehr

import (
	"context"
	"errors"
	"sort"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"clinic-api/internal/user"
	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// Sentinel errors returned by the service. Handlers translate these into the
// appropriate HTTP status via errormap. Using sentinel errors (rather than
// returning *errormap.APIError directly) keeps the service free of HTTP
// concerns, in line with Clean Architecture.
var (
	// ErrInvalidObjectID is returned when a supplied id is not a valid hex
	// ObjectID.
	ErrInvalidObjectID = errors.New("ehr: invalid object id")
	// ErrMedicalRecordNotFound is returned when a medical record lookup yields
	// no document.
	ErrMedicalRecordNotFound = errors.New("ehr: medical record not found")
	// ErrTriageNoteNotFound is returned when a triage note lookup yields no
	// document.
	ErrTriageNoteNotFound = errors.New("ehr: triage note not found")
	// ErrForbidden is returned when the requester is not authorized to access
	// the requested record(s).
	ErrForbidden = errors.New("ehr: forbidden")
	// ErrEmptyRecord is returned when a create request carries neither the
	// legacy Symptoms/Diagnosis fields nor any of the SOAP fields. A record must
	// carry at least one piece of clinically meaningful content.
	ErrEmptyRecord = errors.New("ehr: record has no clinical content")
)

// BookingCompleter is the narrow interface the EHR domain needs to drive the
// SOAP→complete-visit flow. By depending on this tiny surface (rather than the
// whole booking.Service) the EHR package avoids importing the booking domain,
// keeping the Clean-Architecture dependency graph acyclic. The concrete wiring
// happens in bootstrap, where booking.Service satisfies it structurally.
type BookingCompleter interface {
	// CompleteVisit transitions the appointment identified by appointmentID
	// into its terminal "completed" state. It is a no-op-friendly call: if the
	// EHR service holds no completer, completion is skipped silently.
	CompleteVisit(ctx context.Context, appointmentID string) error
}

// Service contains the EHR domain's business logic. It owns the generic
// repository for medical records. The repository is typically created in
// bootstrap from the "medical_records" MongoDB collection.
type Service struct {
	recordRepo *database.Repository[MedicalRecord]
	triageRepo *database.Repository[TriageNote]
	// completer, when set, drives the SOAP→complete-visit flow. It is injected
	// after construction via SetBookingCompleter to avoid a circular bootstrap
	// dependency (booking.Service depends on schedule, ehr may depend on
	// booking). A nil completer makes CompleteVisit a silent no-op.
	completer BookingCompleter
	// visitLookup, when set, supplies the appointment facts the doctor's
	// "My Patients" directory aggregates over. Injected after construction via
	// SetPatientVisitLookup to avoid the ehr package importing the booking
	// domain. nil makes ListDoctorPatients refuse with ErrForbidden.
	visitLookup PatientVisitLookup
	// patientReader, when set, supplies the demographic fields for each
	// patient in the directory. Injected after construction via
	// SetPatientInfoReader to avoid the ehr package importing internal/user.
	// nil makes ListDoctorPatients refuse with ErrForbidden.
	patientReader PatientInfoReader
}

// NewService constructs a Service bound to the given medical record and triage
// repositories. The repositories are typically created in bootstrap from the
// "medical_records" and "triage_notes" MongoDB collections.
func NewService(recordRepo *database.Repository[MedicalRecord], triageRepo *database.Repository[TriageNote]) *Service {
	return &Service{
		recordRepo: recordRepo,
		triageRepo: triageRepo,
	}
}

// SetBookingCompleter wires the booking completer used for the SOAP→complete-
// visit flow. It is a separate setter (rather than a NewService argument) so
// bootstrap can construct the ehr and booking services independently and then
// connect them, breaking the construction-time dependency cycle.
func (s *Service) SetBookingCompleter(c BookingCompleter) {
	s.completer = c
}

// SetPatientVisitLookup wires the appointment-fact source used by the doctor's
// "My Patients" directory. It is a separate setter (rather than a NewService
// argument) so bootstrap can construct the ehr service and the appointments
// repository adapter independently, keeping the ehr package free of a booking
// import.
func (s *Service) SetPatientVisitLookup(v PatientVisitLookup) {
	s.visitLookup = v
}

// SetPatientInfoReader wires the patient-demographics source used by the
// doctor's "My Patients" directory. Same injection rationale as
// SetPatientVisitLookup: it keeps the ehr package free of an internal/user
// import.
func (s *Service) SetPatientInfoReader(r PatientInfoReader) {
	s.patientReader = r
}

// CreateMedicalRecord persists a new medical record authored by a doctor. The
// three hex ids in the request are parsed into ObjectIDs (a parse failure maps
// to ErrInvalidObjectID), the entity is stamped with a fresh ObjectID and the
// current time, and the full (doctor/admin) response is returned. Create is
// restricted to doctors at the bootstrap/middleware layer; this method performs
// no authorization because it always produces a brand-new, doctor-owned record.
func (s *Service) CreateMedicalRecord(ctx context.Context, req *CreateMedicalRecordRequest) (*MedicalRecordFullResponse, error) {
	patientOID, err := primitive.ObjectIDFromHex(req.PatientID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	appointmentOID, err := primitive.ObjectIDFromHex(req.AppointmentID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	// A record is considered SOAP-shaped when any of the SOAP fields were
	// supplied; otherwise it is a legacy GENERAL record. The flag drives how
	// front-ends render the encounter.
	recordType := RecordTypeGeneral
	if req.Subjective != "" || req.Objective != "" || req.Assessment != "" || req.Plan != "" {
		recordType = RecordTypeSOAP
	}

	// With Symptoms/Diagnosis no longer structurally required (to support the
	// SOAP-first flow), enforce that the request still carries at least one
	// piece of clinically meaningful content: either the legacy
	// Symptoms/Diagnosis/Prescription fields or any of the SOAP fields.
	if recordType == RecordTypeGeneral &&
		req.Symptoms == "" && req.Diagnosis == "" && req.Prescription == "" {
		return nil, ErrEmptyRecord
	}

	now := time.Now().UTC()
	record := MedicalRecord{
		ID:            primitive.NewObjectID(),
		PatientID:     patientOID,
		DoctorID:      doctorOID,
		AppointmentID: appointmentOID,
		Symptoms:      req.Symptoms,
		Diagnosis:     req.Diagnosis,
		Prescription:  req.Prescription,
		PrivateNotes:  req.PrivateNotes,
		Subjective:    req.Subjective,
		Objective:     req.Objective,
		Assessment:    req.Assessment,
		Plan:          req.Plan,
		RecordType:    recordType,
		CreatedAt:     now,
	}

	if _, err := s.recordRepo.Insert(ctx, record); err != nil {
		logger.Get().Error("CreateMedicalRecord: insert failed", "doctor_id", req.DoctorID, "patient_id", req.PatientID, "error", err)
		return nil, err
	}

	logger.Get().Info("medical record created", "id", record.ID.Hex(), "doctor_id", req.DoctorID, "patient_id", req.PatientID, "record_type", recordType)

	// SOAP→complete-visit flow: when the client asks for it and a completer is
	// wired, transition the linked appointment to COMPLETED after the record is
	// safely persisted. A nil completer (or unset flag) makes this a no-op.
	if req.CompleteVisit && s.completer != nil && req.AppointmentID != "" {
		if err := s.completer.CompleteVisit(ctx, req.AppointmentID); err != nil {
			// The medical record itself is already saved, so a completion failure
			// must NOT undo it; log and surface the error so the caller knows the
			// record exists but the visit was not finalized.
			logger.Get().Error("CreateMedicalRecord: complete-visit failed", "appointment_id", req.AppointmentID, "error", err)
			return record.ToFullResponse(), err
		}
	}

	return record.ToFullResponse(), nil
}

// GetMedicalRecord returns a single medical record, applying differential
// visibility based on who is asking:
//
//   - If the requester is the record's authoring doctor or any admin, the FULL
//     response (including PrivateNotes) is returned.
//   - If the requester is the record's patient, the response strips
//     PrivateNotes.
//   - Anyone else receives ErrForbidden.
//
// Because the two outcomes carry different types (full vs. stripped), the
// method returns an interface{} so a single call site can return either shape.
// The handler simply serializes whatever it receives with c.JSON.
func (s *Service) GetMedicalRecord(ctx context.Context, id string, requesterID string, requesterRole string) (interface{}, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	record, err := s.recordRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrMedicalRecordNotFound
		}
		logger.Get().Error("GetMedicalRecord: lookup failed", "id", id, "error", err)
		return nil, err
	}

	// Admins and the authoring doctor see everything, including PrivateNotes.
	if requesterRole == string(user.RoleAdmin) || record.DoctorID.Hex() == requesterID {
		return record.ToFullResponse(), nil
	}
	// The patient the record is about sees everything EXCEPT PrivateNotes.
	if record.PatientID.Hex() == requesterID {
		return record.ToResponse(), nil
	}
	// Nobody else is allowed to read this record.
	return nil, ErrForbidden
}

// ListByPatientForPatient returns all of a patient's records, with PrivateNotes
// stripped. The requester must be that very patient; any other identity
// (including a doctor) gets ErrForbidden. The dedicated-patient-accessor naming
// keeps the visibility rules auditable at the call site.
func (s *Service) ListByPatientForPatient(ctx context.Context, patientID string, requesterID string, requesterRole string) ([]*MedicalRecordResponse, error) {
	if requesterRole != string(user.RolePatient) || requesterID != patientID {
		return nil, ErrForbidden
	}

	records, err := s.findByFilter(ctx, bson.M{"patient_id": mustParseOID(patientID)})
	if err != nil {
		return nil, err
	}

	resp := make([]*MedicalRecordResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, r.ToResponse())
	}
	return resp, nil
}

// ListByPatientForDoctor returns all of a patient's records, INCLUDING
// PrivateNotes. The requester must be a doctor (or admin); a patient identity
// is rejected with ErrForbidden. Callers wishing to restrict the result to the
// doctor's own records can filter further; by default every record for the
// patient is returned so a covering doctor has full context.
func (s *Service) ListByPatientForDoctor(ctx context.Context, patientID string, requesterRole string) ([]*MedicalRecordFullResponse, error) {
	if requesterRole != string(user.RoleDoctor) && requesterRole != string(user.RoleAdmin) {
		return nil, ErrForbidden
	}

	records, err := s.findByFilter(ctx, bson.M{"patient_id": mustParseOID(patientID)})
	if err != nil {
		return nil, err
	}

	resp := make([]*MedicalRecordFullResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, r.ToFullResponse())
	}
	return resp, nil
}

// ListByDoctor returns every record authored by the given doctor, including
// PrivateNotes. There is no requester-based authorization here because only
// doctor/admin routes reach it (enforced at the middleware layer); the doctorID
// path parameter scopes the result.
func (s *Service) ListByDoctor(ctx context.Context, doctorID string) ([]*MedicalRecordFullResponse, error) {
	records, err := s.findByFilter(ctx, bson.M{"doctor_id": mustParseOID(doctorID)})
	if err != nil {
		return nil, err
	}

	resp := make([]*MedicalRecordFullResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, r.ToFullResponse())
	}
	return resp, nil
}

// ListByAppointment returns every record tied to the given appointment. To keep
// the response shape uniform and safe regardless of the requester, the
// PrivateNotes field is always stripped here (patient view). Doctors/admins
// needing the full notes should use GetMedicalRecord per record.
func (s *Service) ListByAppointment(ctx context.Context, appointmentID string, requesterID string, requesterRole string) ([]*MedicalRecordResponse, error) {
	_ = requesterID   // accepted for symmetry; authorization is middleware-scoped.
	_ = requesterRole // accepted for symmetry; authorization is middleware-scoped.

	records, err := s.findByFilter(ctx, bson.M{"appointment_id": mustParseOID(appointmentID)})
	if err != nil {
		return nil, err
	}

	resp := make([]*MedicalRecordResponse, 0, len(records))
	for _, r := range records {
		resp = append(resp, r.ToResponse())
	}
	return resp, nil
}

// ListDoctorPatients returns the calling doctor's read-only patient directory:
// one aggregated row per patient who has EVER had an appointment with them.
//
// Authorization is doctor-only — admin is out of scope (this is the doctor's
// OWN patients, so a non-doctor identity is refused with ErrForbidden). The
// visit facts come from the injected PatientVisitLookup (an appointments
// adapter) and are aggregated in memory into per-patient totals; the latest
// diagnosis text is sourced from this doctor's medical records. The result is
// sorted by LastVisit descending (patients with no counted visit sort last)
// and is always a non-nil slice.
func (s *Service) ListDoctorPatients(ctx context.Context, requesterID primitive.ObjectID, requesterRole string) ([]*DoctorPatientSummary, error) {
	if requesterRole != string(user.RoleDoctor) {
		return nil, ErrForbidden
	}
	// Defensive: the collaborators are wired in bootstrap right after the ehr
	// service is constructed, so a nil here means the wiring was forgotten; a
	// 403 is safer than a nil-dereference.
	if s.visitLookup == nil || s.patientReader == nil {
		return nil, ErrForbidden
	}

	facts, err := s.visitLookup.ListVisitsByDoctor(ctx, requesterID)
	if err != nil {
		logger.Get().Error("ListDoctorPatients: visit lookup failed", "doctor_id", requesterID.Hex(), "error", err)
		return nil, err
	}

	// Appointment statuses the directory counts towards a patient's totals.
	countedStatuses := map[string]bool{
		"CONFIRMED":   true,
		"CHECKED_IN":  true,
		"CALLED":      true,
		"IN_PROGRESS": true,
		"COMPLETED":   true,
	}

	// Per-patient aggregation state. The key is the patient ObjectID.
	type visitAgg struct {
		total    int
		done     int
		lastTime *time.Time
	}
	aggs := make(map[primitive.ObjectID]*visitAgg)
	for _, f := range facts {
		if !countedStatuses[f.Status] {
			continue
		}
		agg := aggs[f.PatientID]
		if agg == nil {
			agg = &visitAgg{}
			aggs[f.PatientID] = agg
		}
		agg.total++
		if f.Status == "COMPLETED" {
			agg.done++
		}
		if agg.lastTime == nil || f.StartTime.After(*agg.lastTime) {
			st := f.StartTime
			agg.lastTime = &st
		}
	}

	// Latest diagnosis per patient, from this doctor's medical records. The
	// most recent record wins (created_at desc); a SOAP record contributes its
	// assessment, a GENERAL record its diagnosis.
	records, err := s.findByFilter(ctx, bson.M{"doctor_id": requesterID})
	if err != nil {
		return nil, err
	}
	type diagEntry struct {
		text string
		at   time.Time
	}
	diags := make(map[string]diagEntry)
	for _, r := range records {
		key := r.PatientID.Hex()
		text := r.Diagnosis
		if r.RecordType == RecordTypeSOAP {
			text = r.Assessment
		}
		existing, ok := diags[key]
		if !ok || r.CreatedAt.After(existing.at) {
			diags[key] = diagEntry{text: text, at: r.CreatedAt}
		}
	}

	// Assemble one summary per distinct patient. A patient whose user account
	// can no longer be resolved (e.g. deleted) is skipped rather than failing
	// the whole listing.
	out := make([]*DoctorPatientSummary, 0, len(aggs))
	for patientID, agg := range aggs {
		info, ierr := s.patientReader.GetPatientInfo(ctx, patientID)
		if ierr != nil {
			logger.Get().Warn("ListDoctorPatients: skipping patient, info lookup failed", "patient_id", patientID.Hex(), "error", ierr)
			continue
		}
		lastDiag := diags[patientID.Hex()].text
		out = append(out, &DoctorPatientSummary{
			PatientID:       patientID,
			FirstName:       info.FirstName,
			LastName:        info.LastName,
			Phone:           info.Phone,
			NationalCode:    info.NationalCode,
			TotalVisits:     agg.total,
			CompletedVisits: agg.done,
			LastVisit:       agg.lastTime,
			LastDiagnosis:   lastDiag,
		})
	}

	// Sort by LastVisit descending; patients with no counted visit (nil
	// LastVisit) sort last.
	sort.Slice(out, func(i, j int) bool {
		a, b := out[i].LastVisit, out[j].LastVisit
		if a == nil && b == nil {
			return false
		}
		if a == nil {
			return false
		}
		if b == nil {
			return true
		}
		return a.After(*b)
	})

	return out, nil
}

// findByFilter is the shared read path for the list methods: it parses the
// already-built filter's ObjectIDs implicitly (callers pass pre-parsed OIDs) and
// maps database.ErrNotFound to ErrMedicalRecordNotFound. An empty result is a
// valid (non-error) outcome and yields an empty slice.
func (s *Service) findByFilter(ctx context.Context, filter bson.M) ([]*MedicalRecord, error) {
	records, err := s.recordRepo.FindAll(ctx, filter)
	if err != nil {
		// FindAll returns an empty slice (not ErrNotFound) when nothing matches,
		// so any genuine error here is a storage failure worth logging.
		logger.Get().Error("ehr findByFilter: query failed", "filter", filter, "error", err)
		return nil, err
	}
	return records, nil
}

// mustParseOID is a small helper used only after the request has already been
// authorization-checked and the caller is trusted to supply a valid hex id. If
// the path parameter was malformed it surfaces as a zero ObjectID, which simply
// matches no documents; the handler-level hex validation is the real gatekeeper.
// It is kept local so the list methods stay terse.
func mustParseOID(hex string) primitive.ObjectID {
	oid, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		return primitive.NilObjectID
	}
	return oid
}

// ---------------------------------------------------------------------------
// Triage note operations
// ---------------------------------------------------------------------------

// CreateTriageNote persists a new triage note. The three hex ids in the request
// are parsed into ObjectIDs (a parse failure maps to ErrInvalidObjectID) and
// the entity is stamped with a fresh ObjectID and the current time. It returns
// the sanitized response of the persisted entity.
func (s *Service) CreateTriageNote(ctx context.Context, req CreateTriageNoteRequest) (*TriageNoteResponse, error) {
	patientOID, err := primitive.ObjectIDFromHex(req.PatientID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	doctorOID, err := primitive.ObjectIDFromHex(req.DoctorID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}
	appointmentOID, err := primitive.ObjectIDFromHex(req.AppointmentID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	note := TriageNote{
		ID:            primitive.NewObjectID(),
		PatientID:     patientOID,
		DoctorID:      doctorOID,
		AppointmentID: appointmentOID,
		Symptoms:      req.Symptoms,
		Vitals:        req.Vitals,
		Notes:         req.Notes,
		CreatedAt:     time.Now().UTC(),
	}

	if _, err := s.triageRepo.Insert(ctx, note); err != nil {
		logger.Get().Error("CreateTriageNote: insert failed", "doctor_id", req.DoctorID, "patient_id", req.PatientID, "error", err)
		return nil, err
	}

	logger.Get().Info("triage note created", "id", note.ID.Hex(), "patient_id", req.PatientID, "appointment_id", req.AppointmentID)

	return note.ToResponse(), nil
}

// GetTriageNote returns the single triage note identified by the given hex id.
func (s *Service) GetTriageNote(ctx context.Context, id string) (*TriageNoteResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	note, err := s.triageRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrTriageNoteNotFound
		}
		logger.Get().Error("GetTriageNote: lookup failed", "id", id, "error", err)
		return nil, err
	}

	return note.ToResponse(), nil
}

// ListTriageByPatient returns every triage note for the given patient, newest
// first. An empty result is a valid (non-error) outcome and yields an empty
// slice.
func (s *Service) ListTriageByPatient(ctx context.Context, patientID string) ([]*TriageNoteResponse, error) {
	notes, err := s.findTriageByFilter(ctx, bson.M{"patient_id": mustParseOID(patientID)})
	if err != nil {
		return nil, err
	}

	resp := make([]*TriageNoteResponse, 0, len(notes))
	for _, n := range notes {
		resp = append(resp, n.ToResponse())
	}
	return resp, nil
}

// ListTriageByAppointment returns every triage note tied to the given
// appointment, newest first.
func (s *Service) ListTriageByAppointment(ctx context.Context, appointmentID string) ([]*TriageNoteResponse, error) {
	notes, err := s.findTriageByFilter(ctx, bson.M{"appointment_id": mustParseOID(appointmentID)})
	if err != nil {
		return nil, err
	}

	resp := make([]*TriageNoteResponse, 0, len(notes))
	for _, n := range notes {
		resp = append(resp, n.ToResponse())
	}
	return resp, nil
}

// findTriageByFilter is the shared read path for the triage list methods: it
// queries the triage repository, orders the result newest-first by CreatedAt
// and treats an empty result as a valid (non-error) outcome.
func (s *Service) findTriageByFilter(ctx context.Context, filter bson.M) ([]*TriageNote, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}})
	notes, err := s.triageRepo.FindAllWithOpts(ctx, filter, opts)
	if err != nil {
		logger.Get().Error("ehr findTriageByFilter: query failed", "filter", filter, "error", err)
		return nil, err
	}
	return notes, nil
}
