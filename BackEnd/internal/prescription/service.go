package prescription

import (
	"context"
	"errors"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

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
	ErrInvalidObjectID = errors.New("prescription: invalid object id")
	// ErrNotFound is returned when a prescription lookup yields no document.
	ErrNotFound = errors.New("prescription: not found")
	// ErrForbidden is returned when the requester is not authorized to access
	// or mutate the requested prescription(s).
	ErrForbidden = errors.New("prescription: forbidden")
	// ErrInvalidRequest is returned when the request payload fails domain
	// validation that the struct tags cannot express (e.g. empty search term,
	// unknown status value).
	ErrInvalidRequest = errors.New("prescription: invalid request")
)

// ---------------------------------------------------------------------------
// Optional cross-domain collaborators (narrow, local interfaces)
// ---------------------------------------------------------------------------

// EhrLinker is the narrow interface the prescription domain needs to cross-link
// a freshly issued prescription back onto its source medical record. By
// depending on this tiny surface (rather than the whole ehr.Service) the
// prescription package avoids importing the ehr domain, keeping the Clean-
// Architecture dependency graph acyclic. The concrete wiring (if any) happens
// in bootstrap, where ehr.Service satisfies it structurally. A nil linker
// (the default) makes the cross-link a silent no-op.
type EhrLinker interface {
	// AttachPrescription associates the prescription with the given medical
	// record (and patient). It is best-effort: a failure is logged by the caller
	// but never aborts the prescription creation.
	AttachPrescription(ctx context.Context, medicalRecordID, patientID, prescriptionID primitive.ObjectID) error
}

// Notifier is the narrow interface the prescription domain uses to fan out a
// "prescription issued" notification to the patient. It is nil-safe: a nil
// notifier turns notification into a silent no-op so the rest of the system
// keeps running when notifications are disabled.
type Notifier interface {
	// NotifyPrescriptionIssued informs a patient that a new prescription was
	// issued for them by the named doctor.
	NotifyPrescriptionIssued(ctx context.Context, patientID primitive.ObjectID, doctorName string, prescriptionID primitive.ObjectID) error
}

// DoctorNameResolver is the narrow interface the prescription domain uses to
// resolve a doctor's display name for the notification message. It is nil-safe:
// a nil resolver makes the service fall back to a generic Persian placeholder.
type DoctorNameResolver interface {
	// DoctorName returns the display name of the doctor identified by doctorID.
	DoctorName(ctx context.Context, doctorID primitive.ObjectID) (string, error)
}

// UserNameResolver resolves display names ("FirstName LastName") for a batch of
// user ids in a single lookup. The prescription domain uses it to denormalize
// patient/doctor names onto its responses (so the PDF export can show names
// instead of bare ids). It is nil-safe: a nil resolver leaves the name fields
// empty, which degrades gracefully to the previous behaviour.
type UserNameResolver interface {
	NamesByIDs(ctx context.Context, ids []primitive.ObjectID) (map[primitive.ObjectID]string, error)
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

// Service contains the prescription domain's business logic. It owns the
// generic repository for prescriptions. The repository is typically created in
// bootstrap from the "prescriptions" MongoDB collection.
type Service struct {
	repo *database.Repository[Prescription]
	// linker, when set, cross-links a new prescription onto its source medical
	// record. Injected after construction via SetEhrLinker to avoid a circular
	// bootstrap dependency. A nil linker makes the cross-link a no-op.
	linker EhrLinker
	// notifier, when set, fans out patient notifications. A nil notifier makes
	// notification a no-op.
	notifier Notifier
	// doctorNameResolver, when set, supplies the doctor's display name for the
	// notification message. A nil resolver degrades to a generic placeholder.
	doctorNameResolver DoctorNameResolver
	// userNameResolver, when set, supplies patient/doctor display names that
	// are denormalized onto the prescription responses (e.g. for the PDF
	// export). A nil resolver leaves the name fields empty (best-effort).
	userNameResolver UserNameResolver
}

// NewService constructs a Service bound to the given prescription repository.
// The repository is typically created in bootstrap from the "prescriptions"
// MongoDB collection. The optional collaborators are wired after construction
// via their Set* setters.
func NewService(repo *database.Repository[Prescription]) *Service {
	return &Service{
		repo: repo,
	}
}

// SetEhrLinker wires the EHR cross-linker used to attach a new prescription onto
// its source medical record. It is a separate setter (rather than a NewService
// argument) so bootstrap can construct the prescription and ehr services
// independently and then connect them, breaking any construction-time
// dependency cycle.
func (s *Service) SetEhrLinker(l EhrLinker) { s.linker = l }

// SetNotifier wires the notifier used for the "prescription issued" patient
// notification.
func (s *Service) SetNotifier(n Notifier) { s.notifier = n }

// SetDoctorNameResolver wires the doctor-name resolver used to format the
// notification message.
func (s *Service) SetDoctorNameResolver(r DoctorNameResolver) { s.doctorNameResolver = r }

// SetUserNameResolver wires the user-name resolver used to denormalize
// patient/doctor display names onto the prescription responses.
func (s *Service) SetUserNameResolver(r UserNameResolver) { s.userNameResolver = r }

// resolveNames returns a map of user ObjectID -> display name covering every
// patient and doctor referenced by the given prescriptions. It performs a
// single batched lookup and is best-effort: a nil resolver, an empty input or
// any storage error yields an empty map so callers degrade gracefully to the
// bare-id behaviour.
func (s *Service) resolveNames(ctx context.Context, prescriptions []*Prescription) map[primitive.ObjectID]string {
	if s.userNameResolver == nil || len(prescriptions) == 0 {
		return map[primitive.ObjectID]string{}
	}
	seen := make(map[primitive.ObjectID]struct{}, len(prescriptions)*2)
	ids := make([]primitive.ObjectID, 0, len(prescriptions)*2)
	for _, p := range prescriptions {
		for _, id := range []primitive.ObjectID{p.PatientID, p.DoctorID} {
			if id.IsZero() {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			ids = append(ids, id)
		}
	}
	names, err := s.userNameResolver.NamesByIDs(ctx, ids)
	if err != nil {
		logger.Get().Warn("prescription: resolve user names failed", "count", len(ids), "error", err)
		return map[primitive.ObjectID]string{}
	}
	return names
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

// Create persists a new prescription authored by the given doctor. The patient
// (and optional appointment/medical record) hex ids in the request are parsed
// into ObjectIDs (a parse failure maps to ErrInvalidObjectID), the entity is
// stamped with a fresh ObjectID, StatusActive and the current timestamps, and
// the full (doctor/admin) response is returned.
//
// Side effects (all best-effort and never abort the persist):
//   - when NotifyPatient is set: resolve the doctor's name (falling back to a
//     generic Persian placeholder) and fire the notification;
//   - when MedicalRecordID is set: cross-link the prescription onto the EHR.
func (s *Service) Create(ctx context.Context, req CreatePrescriptionRequest, doctorID primitive.ObjectID) (*PrescriptionFullResponse, error) {
	patientOID, err := primitive.ObjectIDFromHex(req.PatientID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	var appointmentOID primitive.ObjectID
	if req.AppointmentID != "" {
		appointmentOID, err = primitive.ObjectIDFromHex(req.AppointmentID)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
	}

	var medicalRecordOID primitive.ObjectID
	if req.MedicalRecordID != "" {
		medicalRecordOID, err = primitive.ObjectIDFromHex(req.MedicalRecordID)
		if err != nil {
			return nil, ErrInvalidObjectID
		}
	}

	// Map the request items onto the persisted entity shape.
	items := make([]PrescriptionItem, 0, len(req.Items))
	for _, it := range req.Items {
		items = append(items, PrescriptionItem{
			DrugName:  it.DrugName,
			RxCUI:     it.RxCUI,
			Dose:      it.Dose,
			Frequency: it.Frequency,
			Duration:  it.Duration,
			Sig:       it.Sig,
			Quantity:  it.Quantity,
		})
	}

	now := time.Now().UTC()
	p := Prescription{
		ID:              primitive.NewObjectID(),
		PatientID:       patientOID,
		DoctorID:        doctorID,
		AppointmentID:   appointmentOID,
		MedicalRecordID: medicalRecordOID,
		Items:           items,
		Notes:           req.Notes,
		Status:          StatusActive,
		CreatedAt:       now,
		UpdatedAt:       now,
	}

	if _, err := s.repo.Insert(ctx, p); err != nil {
		logger.Get().Error("prescription Create: insert failed", "doctor_id", doctorID.Hex(), "patient_id", req.PatientID, "error", err)
		return nil, err
	}

	logger.Get().Info("prescription created", "id", p.ID.Hex(), "doctor_id", doctorID.Hex(), "patient_id", req.PatientID, "items", len(items))

	// Best-effort patient notification. A failure (or no notifier wired) must
	// never undo the persist or fail the operation; errors are only logged.
	if req.NotifyPatient {
		s.notifyPatientBestEffort(ctx, p)
	}

	// Best-effort EHR cross-link. Only attempted when a medical record id was
	// supplied and a linker is wired. A failure is logged but never returned so
	// the prescription itself is always reported as created.
	if !medicalRecordOID.IsZero() && s.linker != nil {
		if err := s.linker.AttachPrescription(ctx, medicalRecordOID, patientOID, p.ID); err != nil {
			logger.Get().Error("prescription Create: ehr cross-link failed", "prescription_id", p.ID.Hex(), "medical_record_id", medicalRecordOID.Hex(), "error", err)
		}
	}

	resp := p.ToFullResponse()
	names := s.resolveNames(ctx, []*Prescription{&p})
	resp.PatientName = names[resp.PatientID]
	resp.DoctorName = names[resp.DoctorID]
	return resp, nil
}

// notifyPatientBestEffort resolves the doctor's display name (falling back to a
// generic Persian placeholder) and dispatches the "prescription issued"
// notification. Any failure is logged and swallowed so it can never fail the
// surrounding create operation.
func (s *Service) notifyPatientBestEffort(ctx context.Context, p Prescription) {
	doctorName := "پزشک شما"
	if s.doctorNameResolver != nil {
		if name, err := s.doctorNameResolver.DoctorName(ctx, p.DoctorID); err == nil && name != "" {
			doctorName = name
		} else if err != nil {
			logger.Get().Warn("prescription Create: doctor name resolve failed, using placeholder", "doctor_id", p.DoctorID.Hex(), "error", err)
		}
	}

	if s.notifier == nil {
		return
	}
	if err := s.notifier.NotifyPrescriptionIssued(ctx, p.PatientID, doctorName, p.ID); err != nil {
		logger.Get().Error("prescription Create: notify patient failed", "prescription_id", p.ID.Hex(), "patient_id", p.PatientID.Hex(), "error", err)
	}
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

// GetByID returns a single prescription, applying differential visibility based
// on who is asking:
//
//   - If the requester is the prescription's authoring doctor or any admin, the
//     FULL response (including Notes) is returned.
//   - If the requester is the prescription's patient, the response strips Notes.
//   - Anyone else receives ErrForbidden.
//
// Because the two outcomes carry different types (full vs. stripped), the
// method returns an interface{} so a single call site can return either shape.
// The handler simply serializes whatever it receives with c.JSON.
func (s *Service) GetByID(ctx context.Context, id primitive.ObjectID, requesterID primitive.ObjectID, requesterRole string) (interface{}, error) {
	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrNotFound
		}
		logger.Get().Error("prescription GetByID: lookup failed", "id", id.Hex(), "error", err)
		return nil, err
	}

	// Resolve display names once (best-effort) so every response shape carries
	// the patient/doctor names for the PDF export.
	names := s.resolveNames(ctx, []*Prescription{p})

	// Admins and the authoring doctor see everything, including Notes.
	if requesterRole == string(user.RoleAdmin) || p.DoctorID == requesterID {
		resp := p.ToFullResponse()
		resp.PatientName = names[resp.PatientID]
		resp.DoctorName = names[resp.DoctorID]
		return resp, nil
	}
	// The patient the prescription is for sees everything EXCEPT Notes.
	if p.PatientID == requesterID {
		resp := p.ToResponse()
		resp.PatientName = names[resp.PatientID]
		resp.DoctorName = names[resp.DoctorID]
		return resp, nil
	}
	// Nobody else is allowed to read this prescription.
	return nil, ErrForbidden
}

// ListByPatient returns all of a patient's prescriptions, applying differential
// visibility based on who is asking:
//
//   - Doctors and admins see the FULL responses (including Notes).
//   - The patient themselves sees the stripped responses.
//   - Anyone else receives ErrForbidden.
//
// Because the two outcomes carry different element types, the method returns an
// interface{} (a []*PrescriptionFullResponse or []*PrescriptionResponse) so a
// single call site can return either shape. The handler serializes whatever it
// receives with c.JSON.
func (s *Service) ListByPatient(ctx context.Context, patientID primitive.ObjectID, requesterID primitive.ObjectID, requesterRole string) (interface{}, error) {
	prescriptions, err := s.findByFilter(ctx, bson.M{"patient_id": patientID})
	if err != nil {
		return nil, err
	}

	// Resolve display names once (best-effort) for the PDF export.
	names := s.resolveNames(ctx, prescriptions)

	// Admins and any doctor see the full set (covering doctor context).
	if requesterRole == string(user.RoleAdmin) || requesterRole == string(user.RoleDoctor) {
		resp := make([]*PrescriptionFullResponse, 0, len(prescriptions))
		for _, p := range prescriptions {
			r := p.ToFullResponse()
			r.PatientName = names[r.PatientID]
			r.DoctorName = names[r.DoctorID]
			resp = append(resp, r)
		}
		return resp, nil
	}

	// The patient themselves sees the stripped set.
	if requesterID == patientID {
		resp := make([]*PrescriptionResponse, 0, len(prescriptions))
		for _, p := range prescriptions {
			r := p.ToResponse()
			r.PatientName = names[r.PatientID]
			r.DoctorName = names[r.DoctorID]
			resp = append(resp, r)
		}
		return resp, nil
	}

	// Nobody else may list a patient's prescriptions.
	return nil, ErrForbidden
}

// ListByDoctor returns every prescription issued by the given doctor, including
// Notes. There is no requester-based authorization here because only
// doctor/admin routes reach it (enforced at the middleware layer); the doctorID
// path parameter scopes the result.
func (s *Service) ListByDoctor(ctx context.Context, doctorID primitive.ObjectID) ([]*PrescriptionFullResponse, error) {
	prescriptions, err := s.findByFilter(ctx, bson.M{"doctor_id": doctorID})
	if err != nil {
		return nil, err
	}

	// Resolve display names once (best-effort) for the PDF export.
	names := s.resolveNames(ctx, prescriptions)

	resp := make([]*PrescriptionFullResponse, 0, len(prescriptions))
	for _, p := range prescriptions {
		r := p.ToFullResponse()
		r.PatientName = names[r.PatientID]
		r.DoctorName = names[r.DoctorID]
		resp = append(resp, r)
	}
	return resp, nil
}

// findByFilter is the shared read path for the list methods: it runs the filter
// against the repository and maps genuine storage errors. An empty result is a
// valid (non-error) outcome and yields an empty slice.
func (s *Service) findByFilter(ctx context.Context, filter bson.M) ([]*Prescription, error) {
	prescriptions, err := s.repo.FindAll(ctx, filter)
	if err != nil {
		// FindAll returns an empty slice (not ErrNotFound) when nothing matches,
		// so any genuine error here is a storage failure worth logging.
		logger.Get().Error("prescription findByFilter: query failed", "filter", fmt.Sprintf("%v", filter), "error", err)
		return nil, err
	}
	return prescriptions, nil
}

// ---------------------------------------------------------------------------
// UpdateStatus
// ---------------------------------------------------------------------------

// validStatuses is the set of lifecycle states a prescription may be moved to.
var validStatuses = map[string]Status{
	string(StatusActive):    StatusActive,
	string(StatusCompleted): StatusCompleted,
	string(StatusCancelled): StatusCancelled,
}

// UpdateStatus transitions a prescription to the requested lifecycle state.
// Only the authoring doctor or an admin may change the status (else
// ErrForbidden); an unknown status value yields ErrInvalidRequest. The full
// (doctor/admin) response of the updated prescription is returned.
func (s *Service) UpdateStatus(ctx context.Context, id primitive.ObjectID, requesterID primitive.ObjectID, requesterRole string, status string) (*PrescriptionFullResponse, error) {
	target, ok := validStatuses[status]
	if !ok {
		return nil, ErrInvalidRequest
	}

	p, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrNotFound
		}
		logger.Get().Error("prescription UpdateStatus: lookup failed", "id", id.Hex(), "error", err)
		return nil, err
	}

	// Only the authoring doctor (or an admin) may change the status.
	if requesterRole != string(user.RoleAdmin) && p.DoctorID != requesterID {
		return nil, ErrForbidden
	}

	now := time.Now().UTC()
	update := bson.M{"$set": bson.M{
		"status":     string(target),
		"updated_at": now,
	}}
	if err := s.repo.Update(ctx, id, update); err != nil {
		logger.Get().Error("prescription UpdateStatus: update failed", "id", id.Hex(), "error", err)
		return nil, err
	}

	// Reflect the mutation on the in-memory copy so the returned response is
	// consistent without an extra round-trip.
	p.Status = target
	p.UpdatedAt = now
	resp := p.ToFullResponse()
	names := s.resolveNames(ctx, []*Prescription{p})
	resp.PatientName = names[resp.PatientID]
	resp.DoctorName = names[resp.DoctorID]
	return resp, nil
}
