package user

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"golang.org/x/crypto/bcrypt"

	"clinic-api/pkg/database"
	pkgjwt "clinic-api/pkg/jwt"
	"clinic-api/pkg/logger"
)

// Sentinel errors returned by the service. Handlers translate these into the
// appropriate HTTP status via errormap. Using sentinel errors (rather than
// returning *errormap.APIError directly) keeps the service free of HTTP
// concerns, in line with Clean Architecture.
var (
	// ErrUserAlreadyExists is returned when registration is attempted with a
	// phone number that is already in use.
	ErrUserAlreadyExists = errors.New("user: phone already registered")
	// ErrInvalidCredentials is returned when login fails because the phone is
	// unknown or the password does not match. The two cases are deliberately
	// conflated to avoid user-enumeration.
	ErrInvalidCredentials = errors.New("user: invalid credentials")
	// ErrUserNotFound is returned when a lookup by id yields no document.
	ErrUserNotFound = errors.New("user: not found")
	// ErrInvalidRole is returned when a staff-creation request specifies a
	// role that is not permitted for the operation (e.g. an admin endpoint
	// trying to create a PATIENT, or a receptionist role where it is not
	// allowed).
	ErrInvalidRole = errors.New("user: invalid role")
	// ErrDoctorNotFound is returned when an admin tries to manage patients or
	// receptionists under a user id that is not an existing DOCTOR account.
	ErrDoctorNotFound = errors.New("user: doctor not found")
	// ErrNotScopedToDoctor is returned when the target patient/receptionist
	// exists but is not linked to the doctor identified in the route.
	ErrNotScopedToDoctor = errors.New("user: not scoped to this doctor")
)

// Service contains the user domain's business logic. It owns a generic user
// repository and the JWT configuration required to mint tokens on login.
//
// The service is the only layer allowed to talk to the repository and to
// perform password hashing / token issuance, keeping those concerns out of
// both the entity definitions and the HTTP handlers.
type Service struct {
	repo           *database.Repository[User]
	jwtSecret      string
	jwtExpiryHours int
}

// NewService constructs a Service bound to the given repository and JWT
// settings. The repository is typically created in bootstrap from the users
// collection; the JWT values come from the loaded configuration.
func NewService(repo *database.Repository[User], jwtSecret string, jwtExpiryHours int) *Service {
	return &Service{
		repo:           repo,
		jwtSecret:      jwtSecret,
		jwtExpiryHours: jwtExpiryHours,
	}
}

// Register creates a new patient account via the public registration endpoint.
//
// It first ensures the phone number is not already registered, then hashes the
// password with bcrypt (the industry standard adaptive hash) and persists the
// resulting entity. On success it returns the sanitized UserResponse.
//
// SECURITY: public registration is restricted to the PATIENT role. The Role
// field of RegisterRequest is deliberately IGNORED here — any value supplied by
// the caller is discarded and the account is always created as a PATIENT. This
// closes the privilege-escalation hole where an unauthenticated caller could
// self-grant an ADMIN/DOCTOR/RECEPTIONIST role. Privileged accounts are only
// minted by the dedicated, RBAC-protected staff-creation endpoints.
func (s *Service) Register(ctx context.Context, req RegisterRequest) (*UserResponse, error) {
	// Enforce phone uniqueness. A found document means the caller is trying to
	// register an account that already exists.
	existing, err := s.repo.FindOne(ctx, bson.M{"phone": req.Phone})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		// Any error other than "not found" is an unexpected infrastructure
		// failure; surface it so the caller can react (and we log it).
		logger.Get().Error("register: lookup existing user failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserAlreadyExists
	}

	// Hash the password using bcrypt with its default cost. We deliberately do
	// not lower the cost: the default (~10) offers a good security/performance
	// trade-off and registration is not on the hot path.
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		logger.Get().Error("register: password hashing failed", "error", err)
		return nil, err
	}

	now := time.Now()
	user := User{
		ID:           primitive.NewObjectID(),
		Phone:        req.Phone,
		PasswordHash: string(hash),
		// Hardcoded to PATIENT — req.Role is intentionally ignored to prevent
		// privilege escalation from the public endpoint.
		Role:         RolePatient,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		NationalCode: req.NationalCode,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	// Persist the new account. We set the _id ourselves (rather than letting
	// the driver generate one) so the in-memory entity already matches what is
	// stored and we can return it without a second lookup.
	id, err := s.repo.Insert(ctx, user)
	if err != nil {
		logger.Get().Error("register: insert user failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	user.ID = id

	logger.Get().Info("user registered", "id", user.ID.Hex(), "role", user.Role)

	return user.ToResponse(), nil
}

// Login authenticates a STAFF user (ADMIN/DOCTOR/RECEPTIONIST) by username +
// password and, on success, returns a signed JWT together with the user's
// public profile.
//
// Staff authenticate exclusively with a username; patients use OTP instead. For
// backward compatibility with accounts created before usernames existed (e.g.
// the seeded admin), the identifier is also matched against the phone field, so
// a value that is either a username or a phone resolves the same account.
//
// A missing user and a wrong password both yield ErrInvalidCredentials so that
// the error response leaks no information about which one was at fault.
func (s *Service) Login(ctx context.Context, req LoginRequest) (*LoginResponse, error) {
	// Resolve the account by username first, falling back to phone for legacy
	// accounts. The $or keeps this a single round-trip and case-insensitive on
	// the username through exact match (usernames are stored lower-cased by the
	// creation paths).
	// Canonicalize the supplied identifier once: usernames are stored
	// lower-cased/trimmed, so the lookup must use the same form to match.
	identifier := normalizeUsername(req.Username)
	u, err := s.repo.FindOne(ctx, bson.M{
		"$or": bson.A{
			bson.M{"username": identifier},
			// Phone fallback for legacy accounts that pre-date usernames.
			bson.M{"phone": req.Username},
		},
	})
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			// Collapse "no such user" into the generic invalid-credentials error.
			return nil, ErrInvalidCredentials
		}
		logger.Get().Error("login: lookup user failed", "username", req.Username, "error", err)
		return nil, err
	}

	// Compare the supplied plaintext password against the stored hash in
	// constant time to mitigate timing attacks.
	if err := bcrypt.CompareHashAndPassword([]byte(u.PasswordHash), []byte(req.Password)); err != nil {
		return nil, ErrInvalidCredentials
	}

	// Issue a signed JWT carrying the user's identity and role. The token is
	// what downstream protected endpoints will validate.
	token, err := pkgjwt.GenerateToken(u.ID.Hex(), string(u.Role), s.jwtSecret, s.jwtExpiryHours)
	if err != nil {
		logger.Get().Error("login: token generation failed", "user_id", u.ID.Hex(), "error", err)
		return nil, err
	}

	logger.Get().Info("user logged in", "id", u.ID.Hex(), "role", u.Role)

	return &LoginResponse{
		Token: token,
		User:  u.ToResponse(),
	}, nil
}

// GetProfile returns the public profile of the user identified by userID.
// It is the backing implementation for the authenticated "GET /profile"
// endpoint, where userID comes from the JWT via the request context.
func (s *Service) GetProfile(ctx context.Context, userID string) (*UserResponse, error) {
	// Parse the hex string back into an ObjectID. A malformed value here
	// indicates either a bug or a tampered token; treat it as not found.
	oid, err := primitive.ObjectIDFromHex(userID)
	if err != nil {
		return nil, ErrUserNotFound
	}

	u, err := s.repo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrUserNotFound
		}
		logger.Get().Error("getProfile: lookup user failed", "user_id", userID, "error", err)
		return nil, err
	}

	return u.ToResponse(), nil
}

// normalizeUsername canonicalizes a staff username for storage and lookup:
// trimmed and lower-cased so logins are case-insensitive and free of stray
// whitespace. Empty strings are returned unchanged (patients never set one).
func normalizeUsername(username string) string {
	return strings.ToLower(strings.TrimSpace(username))
}

// assertUsernameUnique returns ErrUserAlreadyExists when another account already
// holds the given username. Staff authenticate by username so it must be unique;
// an empty username (a patient) is treated as "not set" and always passes.
func (s *Service) assertUsernameUnique(ctx context.Context, username string) error {
	normalized := normalizeUsername(username)
	if normalized == "" {
		return nil
	}
	existing, err := s.repo.FindOne(ctx, bson.M{"username": normalized})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("username uniqueness lookup failed", "username", normalized, "error", err)
		return err
	}
	if existing != nil {
		return ErrUserAlreadyExists
	}
	return nil
}

// CreateDoctor creates a new privileged account (DOCTOR or ADMIN) on behalf of
// an authenticated administrator. It is the backing implementation for the
// POST /api/v1/admin/users endpoint.
//
// The supplied role must be either RoleDoctor or RoleAdmin — any other value
// is rejected with ErrInvalidRole. The phone must be globally unique; a
// collision yields ErrUserAlreadyExists.
func (s *Service) CreateDoctor(ctx context.Context, req CreateDoctorRequest) (*UserResponse, error) {
	// Only DOCTOR and ADMIN are permitted here; this is a defense-in-depth
	// check on top of the validator "oneof" tag in the DTO.
	if req.Role != RoleDoctor && req.Role != RoleAdmin {
		return nil, ErrInvalidRole
	}

	// Enforce phone uniqueness.
	existing, err := s.repo.FindOne(ctx, bson.M{"phone": req.Phone})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("createDoctor: lookup existing user failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserAlreadyExists
	}

	// Enforce username uniqueness — staff authenticate by username.
	if err := s.assertUsernameUnique(ctx, req.Username); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		logger.Get().Error("createDoctor: password hashing failed", "error", err)
		return nil, err
	}

	now := time.Now()
	u := User{
		ID:           primitive.NewObjectID(),
		Phone:        req.Phone,
		Username:     normalizeUsername(req.Username),
		PasswordHash: string(hash),
		Role:         req.Role,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		NationalCode: req.NationalCode,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	id, err := s.repo.Insert(ctx, u)
	if err != nil {
		logger.Get().Error("createDoctor: insert user failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	u.ID = id

	logger.Get().Info("staff (doctor/admin) created", "id", u.ID.Hex(), "role", u.Role)

	return u.ToResponse(), nil
}

// CreateReceptionist creates a RECEPTIONIST account scoped to the doctor
// identified by doctorID. It is the backing implementation for the
// POST /api/v1/doctor/receptionists endpoint.
//
// The receptionist is scoped to this doctor — they can only manage the
// doctor's schedule and bookings. This scoping is enforced by persisting the
// doctor's id as the new user's EmployerID; downstream schedule/booking code
// can then filter by EmployerID when resolving what the receptionist may see.
func (s *Service) CreateReceptionist(ctx context.Context, req CreateStaffRequest, doctorID primitive.ObjectID) (*UserResponse, error) {
	// Enforce phone uniqueness.
	existing, err := s.repo.FindOne(ctx, bson.M{"phone": req.Phone})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("createReceptionist: lookup existing user failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	if existing != nil {
		return nil, ErrUserAlreadyExists
	}

	// Enforce username uniqueness — staff authenticate by username.
	if err := s.assertUsernameUnique(ctx, req.Username); err != nil {
		return nil, err
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		logger.Get().Error("createReceptionist: password hashing failed", "error", err)
		return nil, err
	}

	now := time.Now()
	u := User{
		ID:           primitive.NewObjectID(),
		Phone:        req.Phone,
		Username:     normalizeUsername(req.Username),
		PasswordHash: string(hash),
		// Role is always RECEPTIONIST — the role is implicit in the endpoint.
		Role:         RoleReceptionist,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		NationalCode: req.NationalCode,
		// Scope the new receptionist to the creating doctor.
		EmployerID: doctorID,
		CreatedAt:  now,
		UpdatedAt:  now,
	}

	id, err := s.repo.Insert(ctx, u)
	if err != nil {
		logger.Get().Error("createReceptionist: insert user failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	u.ID = id

	logger.Get().Info("receptionist created", "id", u.ID.Hex(), "employer_id", doctorID.Hex())

	return u.ToResponse(), nil
}

// ListReceptionists returns every RECEPTIONIST scoped to the doctor identified
// by doctorID (i.e. those whose EmployerID equals doctorID). It backs the
// GET /api/v1/doctor/receptionists endpoint, letting a doctor see the staff they
// have created. Results are ordered by name for a stable display. An empty slice
// (never nil) is returned when the doctor has no receptionists yet.
func (s *Service) ListReceptionists(ctx context.Context, doctorID primitive.ObjectID) ([]*UserResponse, error) {
	// Scope the query to this doctor's receptionists: role must be RECEPTIONIST
	// and the employer link must point at the calling doctor.
	filter := bson.M{
		"role":        RoleReceptionist,
		"employer_id": doctorID,
	}

	// Sort by name so the list renders in a predictable order.
	users, err := s.repo.FindAllWithOpts(ctx, filter, options.Find().SetSort(bson.D{
		{Key: "first_name", Value: 1},
		{Key: "last_name", Value: 1},
	}))
	if err != nil {
		logger.Get().Error("listReceptionists: query failed", "doctor_id", doctorID.Hex(), "error", err)
		return nil, err
	}

	out := make([]*UserResponse, 0, len(users))
	for _, u := range users {
		out = append(out, u.ToResponse())
	}
	return out, nil
}

// NamesByIDs returns a map of ObjectID -> "FirstName LastName" for the given
// user ids, performing a single batched lookup. Ids with no matching user are
// simply absent from the result. An empty input short-circuits with no DB
// round-trip. It lets other domains denormalize display names onto their
// responses (e.g. prescriptions carry patient/doctor names for the PDF export)
// without coupling to the User entity shape.
func (s *Service) NamesByIDs(ctx context.Context, ids []primitive.ObjectID) (map[primitive.ObjectID]string, error) {
	out := make(map[primitive.ObjectID]string, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	users, err := s.repo.FindAll(ctx, bson.M{"_id": bson.M{"$in": ids}})
	if err != nil {
		logger.Get().Error("NamesByIDs: query failed", "count", len(ids), "error", err)
		return out, err
	}
	for _, u := range users {
		out[u.ID] = strings.TrimSpace(u.FirstName + " " + u.LastName)
	}
	return out, nil
}

// assertDoctorExists verifies that doctorID identifies an existing DOCTOR
// account. Used by admin-scoped patient/receptionist mutations so a typo or
// stale route param cannot attach staff to a non-doctor user.
func (s *Service) assertDoctorExists(ctx context.Context, doctorID primitive.ObjectID) error {
	u, err := s.repo.FindByID(ctx, doctorID)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return ErrDoctorNotFound
		}
		logger.Get().Error("assertDoctorExists: lookup failed", "doctor_id", doctorID.Hex(), "error", err)
		return err
	}
	if u.Role != RoleDoctor {
		return ErrDoctorNotFound
	}
	return nil
}

// assertPhoneUnique returns ErrUserAlreadyExists when another account (optionally
// excluding excludeID) already holds the given phone.
func (s *Service) assertPhoneUnique(ctx context.Context, phone string, excludeID primitive.ObjectID) error {
	existing, err := s.repo.FindOne(ctx, bson.M{"phone": phone})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("phone uniqueness lookup failed", "phone", phone, "error", err)
		return err
	}
	if existing != nil && existing.ID != excludeID {
		return ErrUserAlreadyExists
	}
	return nil
}

// assertUsernameUniqueExcluding is like assertUsernameUnique but ignores the
// document identified by excludeID (used on update so a user may keep their
// own username).
func (s *Service) assertUsernameUniqueExcluding(ctx context.Context, username string, excludeID primitive.ObjectID) error {
	normalized := normalizeUsername(username)
	if normalized == "" {
		return nil
	}
	existing, err := s.repo.FindOne(ctx, bson.M{"username": normalized})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("username uniqueness lookup failed", "username", normalized, "error", err)
		return err
	}
	if existing != nil && existing.ID != excludeID {
		return ErrUserAlreadyExists
	}
	return nil
}

// loadScopedUser loads a user by id and verifies they have the expected role
// and are scoped to doctorID. Receptionists must match EmployerID. Patients
// may be linked either via EmployerID (admin-assigned) or via at least one
// appointment with the doctor (booking/OTP flow never sets employer_id).
func (s *Service) loadScopedUser(
	ctx context.Context,
	id, doctorID primitive.ObjectID,
	role Role,
) (*User, error) {
	u, err := s.repo.FindByID(ctx, id)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return nil, ErrUserNotFound
		}
		logger.Get().Error("loadScopedUser: lookup failed", "user_id", id.Hex(), "error", err)
		return nil, err
	}
	if u.Role != role {
		return nil, ErrUserNotFound
	}
	if u.EmployerID == doctorID {
		return u, nil
	}
	if role == RolePatient {
		linked, lerr := s.patientHasAppointmentWithDoctor(ctx, id, doctorID)
		if lerr != nil {
			return nil, lerr
		}
		if linked {
			return u, nil
		}
	}
	return nil, ErrNotScopedToDoctor
}

// distinctAppointmentPatientIDs returns unique patient user ids that have any
// appointment with doctorID (appointments.doctor_id stores the doctor USER id).
func (s *Service) distinctAppointmentPatientIDs(ctx context.Context, doctorID primitive.ObjectID) ([]primitive.ObjectID, error) {
	raw, err := s.repo.Collection().Database().Collection("appointments").Distinct(
		ctx, "patient_id", bson.M{"doctor_id": doctorID},
	)
	if err != nil {
		logger.Get().Error("distinctAppointmentPatientIDs failed", "doctor_id", doctorID.Hex(), "error", err)
		return nil, err
	}
	out := make([]primitive.ObjectID, 0, len(raw))
	for _, v := range raw {
		switch id := v.(type) {
		case primitive.ObjectID:
			if id != primitive.NilObjectID {
				out = append(out, id)
			}
		}
	}
	return out, nil
}

// patientHasAppointmentWithDoctor reports whether patientID has any appointment
// row for doctorID.
func (s *Service) patientHasAppointmentWithDoctor(ctx context.Context, patientID, doctorID primitive.ObjectID) (bool, error) {
	n, err := s.repo.Collection().Database().Collection("appointments").CountDocuments(ctx, bson.M{
		"doctor_id":  doctorID,
		"patient_id": patientID,
	})
	if err != nil {
		logger.Get().Error("patientHasAppointmentWithDoctor failed",
			"doctor_id", doctorID.Hex(), "patient_id", patientID.Hex(), "error", err)
		return false, err
	}
	return n > 0, nil
}

// CreatePatient creates a PATIENT account scoped to the doctor identified by
// doctorID. Patients authenticate via OTP, so no password is stored. EmployerID
// is set to doctorID so the admin "doctor's patients" roster can list them.
//
// When a PATIENT with the same phone already exists (e.g. previously unlinked
// from this doctor), the account is re-linked: employer_id is set, the doctor
// is removed from roster exclusions, and identity fields are refreshed.
func (s *Service) CreatePatient(ctx context.Context, req CreatePatientRequest, doctorID primitive.ObjectID) (*UserResponse, error) {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return nil, err
	}

	existing, err := s.repo.FindOne(ctx, bson.M{"phone": req.Phone})
	if err != nil && !errors.Is(err, database.ErrNotFound) {
		logger.Get().Error("createPatient: phone lookup failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	if existing != nil {
		if existing.Role != RolePatient {
			return nil, ErrUserAlreadyExists
		}
		now := time.Now()
		if err := s.repo.Update(ctx, existing.ID, bson.M{
			"$set": bson.M{
				"first_name":    req.FirstName,
				"last_name":     req.LastName,
				"national_code": req.NationalCode,
				"employer_id":   doctorID,
				"updated_at":    now,
			},
			"$pull": bson.M{"roster_excluded_doctor_ids": doctorID},
		}); err != nil {
			logger.Get().Error("createPatient: relink failed", "patient_id", existing.ID.Hex(), "error", err)
			return nil, err
		}
		existing.FirstName = req.FirstName
		existing.LastName = req.LastName
		existing.NationalCode = req.NationalCode
		existing.EmployerID = doctorID
		existing.UpdatedAt = now
		logger.Get().Info("patient relinked", "id", existing.ID.Hex(), "employer_id", doctorID.Hex())
		return existing.ToResponse(), nil
	}

	now := time.Now()
	u := User{
		ID:           primitive.NewObjectID(),
		Phone:        req.Phone,
		Role:         RolePatient,
		FirstName:    req.FirstName,
		LastName:     req.LastName,
		NationalCode: req.NationalCode,
		EmployerID:   doctorID,
		CreatedAt:    now,
		UpdatedAt:    now,
	}

	id, err := s.repo.Insert(ctx, u)
	if err != nil {
		logger.Get().Error("createPatient: insert failed", "phone", req.Phone, "error", err)
		return nil, err
	}
	u.ID = id

	logger.Get().Info("patient created", "id", u.ID.Hex(), "employer_id", doctorID.Hex())
	return u.ToResponse(), nil
}

// ListPatients returns every PATIENT linked to doctorID: admin-assigned
// (employer_id) plus anyone who has booked an appointment with that doctor.
// OTP/booking patients do not set employer_id, so appointment linkage is
// required for the roster to match the doctor's real patient directory.
// Results are ordered by name. An empty slice (never nil) is returned when
// the doctor has no linked patients yet.
func (s *Service) ListPatients(ctx context.Context, doctorID primitive.ObjectID) ([]*UserResponse, error) {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return nil, err
	}

	byEmployer, err := s.repo.FindAllWithOpts(ctx, bson.M{
		"role":        RolePatient,
		"employer_id": doctorID,
	}, nil)
	if err != nil {
		logger.Get().Error("listPatients: employer query failed", "doctor_id", doctorID.Hex(), "error", err)
		return nil, err
	}

	seen := make(map[primitive.ObjectID]struct{}, len(byEmployer))
	merged := make([]*User, 0, len(byEmployer))
	for _, u := range byEmployer {
		seen[u.ID] = struct{}{}
		merged = append(merged, u)
	}

	apptIDs, err := s.distinctAppointmentPatientIDs(ctx, doctorID)
	if err != nil {
		return nil, err
	}
	missing := make([]primitive.ObjectID, 0, len(apptIDs))
	for _, id := range apptIDs {
		if _, ok := seen[id]; !ok {
			missing = append(missing, id)
		}
	}
	if len(missing) > 0 {
		extra, xerr := s.repo.FindAllWithOpts(ctx, bson.M{
			"role": RolePatient,
			"_id":  bson.M{"$in": missing},
		}, nil)
		if xerr != nil {
			logger.Get().Error("listPatients: appointment patients query failed", "doctor_id", doctorID.Hex(), "error", xerr)
			return nil, xerr
		}
		for _, u := range extra {
			if _, ok := seen[u.ID]; ok {
				continue
			}
			seen[u.ID] = struct{}{}
			merged = append(merged, u)
		}
	}

	// Sort by first_name, last_name in memory (merged from two sources).
	sort.Slice(merged, func(i, j int) bool {
		ai := merged[i].FirstName + " " + merged[i].LastName
		aj := merged[j].FirstName + " " + merged[j].LastName
		return ai < aj
	})

	out := make([]*UserResponse, 0, len(merged))
	for _, u := range merged {
		if containsObjectID(u.RosterExcludedDoctorIDs, doctorID) {
			continue
		}
		out = append(out, u.ToResponse())
	}

	return out, nil
}

// containsObjectID reports whether id is present in ids.
func containsObjectID(ids []primitive.ObjectID, id primitive.ObjectID) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

// UpdatePatient updates identity fields of a PATIENT scoped to doctorID.
func (s *Service) UpdatePatient(
	ctx context.Context,
	patientID, doctorID primitive.ObjectID,
	req UpdatePatientRequest,
) (*UserResponse, error) {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return nil, err
	}
	u, err := s.loadScopedUser(ctx, patientID, doctorID, RolePatient)
	if err != nil {
		return nil, err
	}
	if err := s.assertPhoneUnique(ctx, req.Phone, patientID); err != nil {
		return nil, err
	}

	now := time.Now()
	if err := s.repo.Update(ctx, patientID, bson.M{"$set": bson.M{
		"phone":         req.Phone,
		"first_name":    req.FirstName,
		"last_name":     req.LastName,
		"national_code": req.NationalCode,
		"updated_at":    now,
	}}); err != nil {
		logger.Get().Error("updatePatient: update failed", "patient_id", patientID.Hex(), "error", err)
		return nil, err
	}

	u.Phone = req.Phone
	u.FirstName = req.FirstName
	u.LastName = req.LastName
	u.NationalCode = req.NationalCode
	u.UpdatedAt = now
	logger.Get().Info("patient updated", "id", patientID.Hex(), "employer_id", doctorID.Hex())
	return u.ToResponse(), nil
}

// UnlinkPatient removes a PATIENT from one doctor's admin roster without
// deleting the account. Clears employer_id when it pointed at doctorID and
// records doctorID in roster_excluded_doctor_ids so appointment history alone
// does not keep the patient visible under that doctor. Other doctors' rosters
// are unchanged.
func (s *Service) UnlinkPatient(ctx context.Context, patientID, doctorID primitive.ObjectID) error {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return err
	}
	u, err := s.loadScopedUser(ctx, patientID, doctorID, RolePatient)
	if err != nil {
		return err
	}

	set := bson.M{"updated_at": time.Now()}
	if u.EmployerID == doctorID {
		set["employer_id"] = primitive.NilObjectID
	}
	if err := s.repo.Update(ctx, patientID, bson.M{
		"$set":      set,
		"$addToSet": bson.M{"roster_excluded_doctor_ids": doctorID},
	}); err != nil {
		logger.Get().Error("unlinkPatient: update failed", "patient_id", patientID.Hex(), "error", err)
		return err
	}
	logger.Get().Info("patient unlinked from doctor", "patient_id", patientID.Hex(), "doctor_id", doctorID.Hex())
	return nil
}

// DeletePatient permanently removes the PATIENT user account after verifying
// they are linked to doctorID (employer or appointments). This affects every
// doctor that shared the same account.
func (s *Service) DeletePatient(ctx context.Context, patientID, doctorID primitive.ObjectID) error {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return err
	}
	if _, err := s.loadScopedUser(ctx, patientID, doctorID, RolePatient); err != nil {
		return err
	}
	if err := s.repo.Delete(ctx, patientID); err != nil {
		logger.Get().Error("deletePatient: delete failed", "patient_id", patientID.Hex(), "error", err)
		return err
	}
	logger.Get().Info("patient hard-deleted", "id", patientID.Hex(), "via_doctor_id", doctorID.Hex())
	return nil
}

// UpdateReceptionist updates a RECEPTIONIST scoped to doctorID. An empty
// password leaves the existing hash unchanged.
func (s *Service) UpdateReceptionist(
	ctx context.Context,
	receptionistID, doctorID primitive.ObjectID,
	req UpdateStaffRequest,
) (*UserResponse, error) {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return nil, err
	}
	u, err := s.loadScopedUser(ctx, receptionistID, doctorID, RoleReceptionist)
	if err != nil {
		return nil, err
	}
	if err := s.assertPhoneUnique(ctx, req.Phone, receptionistID); err != nil {
		return nil, err
	}
	if err := s.assertUsernameUniqueExcluding(ctx, req.Username, receptionistID); err != nil {
		return nil, err
	}

	set := bson.M{
		"phone":         req.Phone,
		"username":      normalizeUsername(req.Username),
		"first_name":    req.FirstName,
		"last_name":     req.LastName,
		"national_code": req.NationalCode,
		"updated_at":    time.Now(),
	}
	if strings.TrimSpace(req.Password) != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			logger.Get().Error("updateReceptionist: password hashing failed", "error", err)
			return nil, err
		}
		set["password_hash"] = string(hash)
	}

	if err := s.repo.Update(ctx, receptionistID, bson.M{"$set": set}); err != nil {
		logger.Get().Error("updateReceptionist: update failed", "receptionist_id", receptionistID.Hex(), "error", err)
		return nil, err
	}

	u.Phone = req.Phone
	u.Username = normalizeUsername(req.Username)
	u.FirstName = req.FirstName
	u.LastName = req.LastName
	u.NationalCode = req.NationalCode
	u.UpdatedAt = set["updated_at"].(time.Time)
	logger.Get().Info("receptionist updated", "id", receptionistID.Hex(), "employer_id", doctorID.Hex())
	return u.ToResponse(), nil
}

// DeleteReceptionist removes a RECEPTIONIST scoped to doctorID.
func (s *Service) DeleteReceptionist(ctx context.Context, receptionistID, doctorID primitive.ObjectID) error {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return err
	}
	if _, err := s.loadScopedUser(ctx, receptionistID, doctorID, RoleReceptionist); err != nil {
		return err
	}
	if err := s.repo.Delete(ctx, receptionistID); err != nil {
		logger.Get().Error("deleteReceptionist: delete failed", "receptionist_id", receptionistID.Hex(), "error", err)
		return err
	}
	logger.Get().Info("receptionist deleted", "id", receptionistID.Hex(), "employer_id", doctorID.Hex())
	return nil
}

// CreateReceptionistForDoctor is the admin variant of CreateReceptionist: it
// verifies the target doctor exists, then mints a RECEPTIONIST with EmployerID
// set to that doctor.
func (s *Service) CreateReceptionistForDoctor(
	ctx context.Context,
	req CreateStaffRequest,
	doctorID primitive.ObjectID,
) (*UserResponse, error) {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return nil, err
	}
	return s.CreateReceptionist(ctx, req, doctorID)
}

// ListReceptionistsForDoctor is the admin variant of ListReceptionists: it
// verifies the target doctor exists before listing.
func (s *Service) ListReceptionistsForDoctor(ctx context.Context, doctorID primitive.ObjectID) ([]*UserResponse, error) {
	if err := s.assertDoctorExists(ctx, doctorID); err != nil {
		return nil, err
	}
	return s.ListReceptionists(ctx, doctorID)
}
