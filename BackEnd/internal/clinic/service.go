package clinic

import (
	"context"
	"errors"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"
)

// Sentinel errors returned by the service. Handlers translate these into the
// appropriate HTTP status via errormap. Using sentinel errors (rather than
// returning *errormap.APIError directly) keeps the service free of HTTP
// concerns, in line with Clean Architecture.
var (
	// ErrBranchNotFound is returned when a branch lookup yields no document.
	ErrBranchNotFound = errors.New("clinic: branch not found")
	// ErrDoctorProfileNotFound is returned when a doctor profile lookup yields
	// no document.
	ErrDoctorProfileNotFound = errors.New("clinic: doctor profile not found")
	// ErrInvalidObjectID is returned when a supplied id is not a valid hex
	// ObjectID.
	ErrInvalidObjectID = errors.New("clinic: invalid object id")
	// ErrDoctorProfileExists is returned when a profile already exists for the
	// given UserID (a user may have at most one doctor profile).
	ErrDoctorProfileExists = errors.New("clinic: doctor profile already exists for user")
)

// Service contains the clinic domain's business logic. It owns a generic
// repository for each entity (branches and doctor profiles) and is the only
// layer allowed to talk to the repositories, keeping those concerns out of
// both the entity definitions and the HTTP handlers.
//
// The optional userReader lets the service denormalize user-identity fields
// (name/phone/national code) into doctor-profile responses so admin listings
// are self-contained. It is supplied by the bootstrap layer (not the user
// domain) to respect the dependency-direction rule.
type Service struct {
	branchRepo *database.Repository[Branch]
	doctorRepo *database.Repository[DoctorProfile]
	userReader UserReader
}

// NewService constructs a Service bound to the given repositories. The
// repositories are typically created in bootstrap from the underlying MongoDB
// collections. A nil userReader is permitted: enrichment simply becomes a
// no-op, which keeps the service usable in tests/contexts without users.
func NewService(branchRepo *database.Repository[Branch], doctorRepo *database.Repository[DoctorProfile], userReader UserReader) *Service {
	return &Service{
		branchRepo: branchRepo,
		doctorRepo: doctorRepo,
		userReader: userReader,
	}
}

// enrichProfile fills the denormalized user-identity fields on a profile
// response from the injected UserReader. It is best-effort: any reader error
// (including a missing user) is swallowed and logged at warn level so a
// dangling/orphaned profile never breaks a listing.
func (s *Service) enrichProfile(ctx context.Context, resp *DoctorProfileResponse) {
	if s.userReader == nil || resp == nil {
		return
	}
	u, err := s.userReader.GetByID(ctx, resp.UserID)
	if err != nil {
		logger.Get().Warn("clinic: enrichProfile: user lookup failed", "user_id", resp.UserID.Hex(), "error", err)
		return
	}
	if u == nil {
		return
	}
	resp.FirstName = u.FirstName
	resp.LastName = u.LastName
	resp.Phone = u.Phone
	resp.NationalCode = u.NationalCode
}

// enrichProfiles batch-fills the denormalized user-identity fields on a slice
// of profile responses using a single batched reader call. Missing users are
// skipped rather than erroring so the listing stays robust against orphaned
// profiles.
func (s *Service) enrichProfiles(ctx context.Context, results []*DoctorProfileResponse) {
	if s.userReader == nil || len(results) == 0 {
		return
	}
	ids := make([]primitive.ObjectID, 0, len(results))
	for _, r := range results {
		ids = append(ids, r.UserID)
	}
	users, err := s.userReader.FindByIDs(ctx, ids)
	if err != nil {
		logger.Get().Warn("clinic: enrichProfiles: batch user lookup failed", "error", err)
		return
	}
	for _, r := range results {
		if u, ok := users[r.UserID]; ok && u != nil {
			r.FirstName = u.FirstName
			r.LastName = u.LastName
			r.Phone = u.Phone
			r.NationalCode = u.NationalCode
		}
	}
}

// ---------------------------------------------------------------------------
// Branch operations
// ---------------------------------------------------------------------------

// CreateBranch persists a new branch and returns its sanitized response.
func (s *Service) CreateBranch(ctx context.Context, req CreateBranchRequest) (*BranchResponse, error) {
	now := time.Now()
	branch := Branch{
		ID:        primitive.NewObjectID(),
		Name:      req.Name,
		Address:   req.Address,
		Contact:   req.Contact,
		CreatedAt: now,
		UpdatedAt: now,
	}

	// Persist the new branch. We set _id ourselves so the in-memory entity
	// already matches what is stored and we can return it without a second
	// lookup.
	id, err := s.branchRepo.Insert(ctx, branch)
	if err != nil {
		logger.Get().Error("createBranch: insert failed", "name", req.Name, "error", err)
		return nil, err
	}
	branch.ID = id

	logger.Get().Info("branch created", "id", branch.ID.Hex())

	return branch.ToResponse(), nil
}

// GetBranch returns the branch identified by the given hex id.
func (s *Service) GetBranch(ctx context.Context, id string) (*BranchResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	branch, err := s.branchRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrBranchNotFound
		}
		logger.Get().Error("getBranch: lookup failed", "id", id, "error", err)
		return nil, err
	}

	return branch.ToResponse(), nil
}

// ListBranches returns the sanitized responses for all branches.
func (s *Service) ListBranches(ctx context.Context) ([]*BranchResponse, error) {
	branches, err := s.branchRepo.FindAll(ctx, bson.M{})
	if err != nil {
		logger.Get().Error("listBranches: query failed", "error", err)
		return nil, err
	}

	results := make([]*BranchResponse, 0, len(branches))
	for _, b := range branches {
		results = append(results, b.ToResponse())
	}
	return results, nil
}

// UpdateBranch fully replaces the mutable fields of the branch identified by id.
func (s *Service) UpdateBranch(ctx context.Context, id string, req UpdateBranchRequest) (*BranchResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	update := bson.M{
		"$set": bson.M{
			"name":       req.Name,
			"address":    req.Address,
			"contact":    req.Contact,
			"updated_at": time.Now(),
		},
	}

	if err := s.branchRepo.Update(ctx, oid, update); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrBranchNotFound
		}
		logger.Get().Error("updateBranch: update failed", "id", id, "error", err)
		return nil, err
	}

	// Re-read to return the updated entity, mirroring the create flow.
	branch, err := s.branchRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrBranchNotFound
		}
		logger.Get().Error("updateBranch: re-read failed", "id", id, "error", err)
		return nil, err
	}

	logger.Get().Info("branch updated", "id", id)

	return branch.ToResponse(), nil
}

// DeleteBranch removes the branch identified by id.
func (s *Service) DeleteBranch(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return ErrInvalidObjectID
	}

	if err := s.branchRepo.Delete(ctx, oid); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrBranchNotFound
		}
		logger.Get().Error("deleteBranch: delete failed", "id", id, "error", err)
		return err
	}

	logger.Get().Info("branch deleted", "id", id)

	return nil
}

// ---------------------------------------------------------------------------
// DoctorProfile operations
// ---------------------------------------------------------------------------

// CreateDoctorProfile persists a new doctor profile. It parses the hex UserID
// into an ObjectID and enforces that no profile already exists for that user.
func (s *Service) CreateDoctorProfile(ctx context.Context, req CreateDoctorProfileRequest) (*DoctorProfileResponse, error) {
	// Parse the hex user id into an ObjectID. A malformed value is a client
	// error rather than a not-found case.
	userOID, err := primitive.ObjectIDFromHex(req.UserID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	// Enforce that each user has at most one doctor profile.
	existing, err := s.doctorRepo.FindOne(ctx, bson.M{"user_id": userOID})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("createDoctorProfile: lookup existing failed", "user_id", req.UserID, "error", err)
		return nil, err
	}
	if existing != nil {
		return nil, ErrDoctorProfileExists
	}

	now := time.Now()
	profile := DoctorProfile{
		ID:                   primitive.NewObjectID(),
		UserID:               userOID,
		Specialty:            req.Specialty,
		MedicalSystemNumber:  req.MedicalSystemNumber,
		VisitDurationMinutes: req.VisitDurationMinutes,
		VisitFee:             req.VisitFee,
		CreatedAt:            now,
		UpdatedAt:            now,
	}

	id, err := s.doctorRepo.Insert(ctx, profile)
	if err != nil {
		logger.Get().Error("createDoctorProfile: insert failed", "user_id", req.UserID, "error", err)
		return nil, err
	}
	profile.ID = id

	logger.Get().Info("doctor profile created", "id", profile.ID.Hex(), "user_id", req.UserID)

	resp := profile.ToResponse()
	s.enrichProfile(ctx, resp)
	return resp, nil
}

// GetDoctorProfile returns the profile identified by the given hex id.
func (s *Service) GetDoctorProfile(ctx context.Context, id string) (*DoctorProfileResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	profile, err := s.doctorRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrDoctorProfileNotFound
		}
		logger.Get().Error("getDoctorProfile: lookup failed", "id", id, "error", err)
		return nil, err
	}

	resp := profile.ToResponse()
	s.enrichProfile(ctx, resp)
	return resp, nil
}

// GetDoctorProfileByUserID returns the profile associated with the given hex
// user id.
func (s *Service) GetDoctorProfileByUserID(ctx context.Context, userID string) (*DoctorProfileResponse, error) {
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	profile, err := s.doctorRepo.FindOne(ctx, bson.M{"user_id": userOID})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrDoctorProfileNotFound
		}
		logger.Get().Error("getDoctorProfileByUserID: lookup failed", "user_id", userID, "error", err)
		return nil, err
	}

	return profile.ToResponse(), nil
}

// UpdateMyProfile lets a signed-in DOCTOR update their OWN pricing settings
// (visit fee + default visit duration). It is scoped by the caller's user id:
// the profile is looked up by user_id and only the doctor-owned fields are
// mutated, so a doctor can never touch another doctor's profile or the
// admin-controlled identity/specialty fields. A missing profile yields
// ErrDoctorProfileNotFound.
func (s *Service) UpdateMyProfile(ctx context.Context, userID string, req UpdateMyProfileRequest) (*DoctorProfileResponse, error) {
	userOID, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	// Locate the caller's own profile by user_id.
	profile, err := s.doctorRepo.FindOne(ctx, bson.M{"user_id": userOID})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrDoctorProfileNotFound
		}
		logger.Get().Error("updateMyProfile: lookup failed", "user_id", userID, "error", err)
		return nil, err
	}

	update := bson.M{
		"$set": bson.M{
			"visit_fee":              req.VisitFee,
			"visit_duration_minutes": req.VisitDurationMinutes,
			"updated_at":             time.Now(),
		},
	}

	if err := s.doctorRepo.Update(ctx, profile.ID, update); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrDoctorProfileNotFound
		}
		logger.Get().Error("updateMyProfile: update failed", "user_id", userID, "error", err)
		return nil, err
	}

	// Re-read to return the updated entity, mirroring the other update flows.
	updated, err := s.doctorRepo.FindByID(ctx, profile.ID)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrDoctorProfileNotFound
		}
		logger.Get().Error("updateMyProfile: re-read failed", "user_id", userID, "error", err)
		return nil, err
	}

	logger.Get().Info("doctor self-updated profile", "profile_id", profile.ID.Hex(), "user_id", userID, "visit_fee", req.VisitFee)

	resp := updated.ToResponse()
	s.enrichProfile(ctx, resp)
	return resp, nil
}

// ListDoctorProfiles returns the sanitized responses for all doctor profiles.
func (s *Service) ListDoctorProfiles(ctx context.Context) ([]*DoctorProfileResponse, error) {
	profiles, err := s.doctorRepo.FindAll(ctx, bson.M{})
	if err != nil {
		logger.Get().Error("listDoctorProfiles: query failed", "error", err)
		return nil, err
	}

	results := make([]*DoctorProfileResponse, 0, len(profiles))
	for _, p := range profiles {
		results = append(results, p.ToResponse())
	}
	s.enrichProfiles(ctx, results)
	s.enrichRosterCounts(ctx, results)
	return results, nil
}

// enrichRosterCounts fills patient_count and receptionist_count on each profile
// response using a single batched reader call per count type. Reader errors are
// swallowed (warn-logged) so a count failure never breaks the doctors listing.
func (s *Service) enrichRosterCounts(ctx context.Context, results []*DoctorProfileResponse) {
	if s.userReader == nil || len(results) == 0 {
		return
	}
	ids := make([]primitive.ObjectID, 0, len(results))
	for _, r := range results {
		ids = append(ids, r.UserID)
	}
	recv, err := s.userReader.CountReceptionistsByEmployerIDs(ctx, ids)
	if err != nil {
		logger.Get().Warn("clinic: enrichRosterCounts: receptionist count failed", "error", err)
		recv = nil
	}
	pats, err := s.userReader.CountPatientsByDoctorIDs(ctx, ids)
	if err != nil {
		logger.Get().Warn("clinic: enrichRosterCounts: patient count failed", "error", err)
		pats = nil
	}
	for _, r := range results {
		if recv != nil {
			r.ReceptionistCount = recv[r.UserID]
		}
		if pats != nil {
			r.PatientCount = pats[r.UserID]
		}
	}
}

// UpdateDoctorProfile fully replaces the mutable fields of the profile
// identified by id.
func (s *Service) UpdateDoctorProfile(ctx context.Context, id string, req UpdateDoctorProfileRequest) (*DoctorProfileResponse, error) {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return nil, ErrInvalidObjectID
	}

	update := bson.M{
		"$set": bson.M{
			"specialty":              req.Specialty,
			"medical_system_number":  req.MedicalSystemNumber,
			"visit_duration_minutes": req.VisitDurationMinutes,
			"visit_fee":              req.VisitFee,
			"updated_at":             time.Now(),
		},
	}

	if err := s.doctorRepo.Update(ctx, oid, update); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrDoctorProfileNotFound
		}
		logger.Get().Error("updateDoctorProfile: update failed", "id", id, "error", err)
		return nil, err
	}

	// Re-read to return the updated entity, mirroring the create flow.
	profile, err := s.doctorRepo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrDoctorProfileNotFound
		}
		logger.Get().Error("updateDoctorProfile: re-read failed", "id", id, "error", err)
		return nil, err
	}

	logger.Get().Info("doctor profile updated", "id", id)

	resp := profile.ToResponse()
	s.enrichProfile(ctx, resp)
	return resp, nil
}

// DeleteDoctorProfile removes the profile identified by id.
func (s *Service) DeleteDoctorProfile(ctx context.Context, id string) error {
	oid, err := primitive.ObjectIDFromHex(id)
	if err != nil {
		return ErrInvalidObjectID
	}

	if err := s.doctorRepo.Delete(ctx, oid); err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrDoctorProfileNotFound
		}
		logger.Get().Error("deleteDoctorProfile: delete failed", "id", id, "error", err)
		return err
	}

	logger.Get().Info("doctor profile deleted", "id", id)

	return nil
}
