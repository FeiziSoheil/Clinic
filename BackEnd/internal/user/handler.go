package user

import (
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/pkg/errormap"
	"clinic-api/pkg/logger"
	"clinic-api/pkg/requestctx"
)

// Handler exposes the user domain over HTTP. Each method maps a route to a
// Service call and translates the result/error into the consistent JSON shape
// defined by the errormap package.
//
// The handler is intentionally thin: all business rules live in the service,
// so this file only concerns itself with request binding, validation and HTTP
// status selection.
type Handler struct {
	service *Service
}

// NewHandler constructs a Handler backed by the given Service.
func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// RegisterRoutes wires the handler's methods onto the provided Echo group.
//
// Authentication/authorization middleware is applied by the caller (e.g. in
// bootstrap) when attaching the group, so this method only declares the
// route-to-handler mapping itself.
func (h *Handler) RegisterRoutes(g *echo.Group) {
	g.POST("/register", h.Register)
	g.POST("/login", h.Login)
	g.GET("/profile", h.GetProfile)
}

// Register handles POST /register.
//
// It binds and validates the incoming RegisterRequest, delegates to the
// service, and returns the newly created user as a UserResponse with HTTP 201.
//
// @Summary      Register a new user
// @Description  Create a new user account (patient/doctor/receptionist/admin)
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body user.RegisterRequest true "Register payload"
// @Success      201 {object} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Router       /auth/register [post]
func (h *Handler) Register(c echo.Context) error {
	var req RegisterRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		// Validation failures carry useful detail; pass the validator's message.
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.Register(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// Login handles POST /login.
//
// On success it returns 200 with a LoginResponse containing the JWT and the
// user's public profile.
//
// @Summary      Login
// @Description  Authenticate a user and return a JWT
// @Tags         auth
// @Accept       json
// @Produce      json
// @Param        body body user.LoginRequest true "Login payload"
// @Success      200 {object} user.LoginResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Router       /auth/login [post]
func (h *Handler) Login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.Login(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// GetProfile handles GET /profile.
//
// The authenticated user's id is injected into the request context by the
// JWTAuth middleware (via requestctx.SetUserID); we read it here and ask the
// service for the matching public profile.
//
// @Summary      Get current user profile
// @Description  Return the authenticated user's public profile
// @Tags         auth
// @Produce      json
// @Security     ApiKeyAuth
// @Success      200 {object} user.UserResponse
// @Failure      401 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Router       /auth/profile [get]
func (h *Handler) GetProfile(c echo.Context) error {
	userID := requestctx.GetUserID(c)
	if userID == "" {
		// No identity means the auth middleware did not run/succeed.
		return writeError(c, errormap.ErrUnauthorized, "missing user id in context")
	}

	resp, err := h.service.GetProfile(c.Request().Context(), userID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// CreateDoctor handles POST /api/v1/admin/users.
//
// It is RBAC-protected to ADMIN only. It binds/validates a CreateDoctorRequest
// (role must be DOCTOR or ADMIN), delegates to the service, and returns the
// newly created user as a UserResponse with HTTP 201.
//
// @Summary      Create a doctor or admin
// @Description  Admin-only endpoint that mints a privileged DOCTOR or ADMIN account
// @Tags         staff
// @Accept       json
// @Produce      json
// @Param        body body user.CreateDoctorRequest true "Staff payload"
// @Success      201 {object} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/users [post]
func (h *Handler) CreateDoctor(c echo.Context) error {
	var req CreateDoctorRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateDoctor(c.Request().Context(), req)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// CreateReceptionist handles POST /api/v1/doctor/receptionists.
//
// It is RBAC-protected to DOCTOR only. It binds/validates a CreateStaffRequest,
// resolves the authenticated doctor's id from the JWT context, and delegates to
// the service — which creates a RECEPTIONIST scoped to that doctor via the
// EmployerID link.
//
// @Summary      Create a receptionist
// @Description  Doctor-only endpoint that mints a RECEPTIONIST scoped to the calling doctor
// @Tags         staff
// @Accept       json
// @Produce      json
// @Param        body body user.CreateStaffRequest true "Staff payload"
// @Success      201 {object} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /doctor/receptionists [post]
func (h *Handler) CreateReceptionist(c echo.Context) error {
	// Resolve the authenticated doctor's identity. JWTAuth (run upstream) is
	// expected to have populated the context; RoleAuth ensures the caller is a
	// DOCTOR. A missing/invalid id here is a defensive 401.
	doctorIDHex := requestctx.GetUserID(c)
	if doctorIDHex == "" {
		return writeError(c, errormap.ErrUnauthorized, "missing user id in context")
	}
	doctorID, err := primitive.ObjectIDFromHex(doctorIDHex)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid doctor id")
	}

	var req CreateStaffRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}

	resp, err := h.service.CreateReceptionist(c.Request().Context(), req, doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusCreated, resp)
}

// ListReceptionists handles GET /api/v1/doctor/receptionists.
//
// It is RBAC-protected to DOCTOR only. It resolves the authenticated doctor's
// id from the JWT context and returns the list of receptionists scoped to that
// doctor (those whose employer_id equals the calling doctor).
//
// @Summary      List receptionists
// @Description  Doctor-only endpoint that returns the receptionists scoped to the calling doctor
// @Tags         staff
// @Produce      json
// @Success      200 {array} user.UserResponse
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /doctor/receptionists [get]
func (h *Handler) ListReceptionists(c echo.Context) error {
	// Resolve the authenticated doctor's identity. JWTAuth (run upstream) is
	// expected to have populated the context; RoleAuth ensures the caller is a
	// DOCTOR. A missing/invalid id here is a defensive 401.
	doctorIDHex := requestctx.GetUserID(c)
	if doctorIDHex == "" {
		return writeError(c, errormap.ErrUnauthorized, "missing user id in context")
	}
	doctorID, err := primitive.ObjectIDFromHex(doctorIDHex)
	if err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid doctor id")
	}

	resp, err := h.service.ListReceptionists(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}

	return c.JSON(http.StatusOK, resp)
}

// parseDoctorID extracts and validates the :doctorId path parameter as an
// ObjectID. Returns a zero id and a JSON error response when the value is
// missing or malformed.
func parseDoctorID(c echo.Context) (primitive.ObjectID, error) {
	hex := c.Param("doctorId")
	if hex == "" {
		return primitive.NilObjectID, writeError(c, errormap.ErrBadRequest, "missing doctor id")
	}
	oid, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		return primitive.NilObjectID, writeError(c, errormap.ErrBadRequest, "invalid doctor id")
	}
	return oid, nil
}

// parseScopedResourceID extracts and validates a named path parameter as an
// ObjectID (e.g. "id" for patient/receptionist id).
func parseScopedResourceID(c echo.Context, param string) (primitive.ObjectID, error) {
	hex := c.Param(param)
	if hex == "" {
		return primitive.NilObjectID, writeError(c, errormap.ErrBadRequest, "missing resource id")
	}
	oid, err := primitive.ObjectIDFromHex(hex)
	if err != nil {
		return primitive.NilObjectID, writeError(c, errormap.ErrBadRequest, "invalid resource id")
	}
	return oid, nil
}

// AdminListPatients handles GET /api/v1/admin/doctors/:doctorId/patients.
//
// @Summary      List a doctor's patients
// @Description  Admin-only: return PATIENT accounts assigned to the given doctor
// @Tags         admin-patients
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Success      200 {array} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/patients [get]
func (h *Handler) AdminListPatients(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	resp, err := h.service.ListPatients(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// AdminCreatePatient handles POST /api/v1/admin/doctors/:doctorId/patients.
//
// @Summary      Create a patient for a doctor
// @Description  Admin-only: mint a PATIENT assigned to the given doctor
// @Tags         admin-patients
// @Accept       json
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Param        body body user.CreatePatientRequest true "Patient payload"
// @Success      201 {object} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/patients [post]
func (h *Handler) AdminCreatePatient(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	var req CreatePatientRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	resp, err := h.service.CreatePatient(c.Request().Context(), req, doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, resp)
}

// AdminUpdatePatient handles PUT /api/v1/admin/doctors/:doctorId/patients/:id.
//
// @Summary      Update a doctor's patient
// @Description  Admin-only: update a PATIENT assigned to the given doctor
// @Tags         admin-patients
// @Accept       json
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Param        id path string true "Patient user id"
// @Param        body body user.UpdatePatientRequest true "Patient payload"
// @Success      200 {object} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/patients/{id} [put]
func (h *Handler) AdminUpdatePatient(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	patientID, err := parseScopedResourceID(c, "id")
	if err != nil {
		return err
	}
	var req UpdatePatientRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	resp, err := h.service.UpdatePatient(c.Request().Context(), patientID, doctorID, req)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// AdminDeletePatient handles DELETE /api/v1/admin/doctors/:doctorId/patients/:id.
//
// Query `mode` selects the delete semantics:
//   - mode=unlink (default): remove from this doctor's roster only
//   - mode=hard: permanently delete the PATIENT account
//
// @Summary      Remove or delete a doctor's patient
// @Description  Admin-only: unlink from this doctor (default) or hard-delete the account
// @Tags         admin-patients
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Param        id path string true "Patient user id"
// @Param        mode query string false "unlink (default) or hard"
// @Success      204 "No Content"
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/patients/{id} [delete]
func (h *Handler) AdminDeletePatient(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	patientID, err := parseScopedResourceID(c, "id")
	if err != nil {
		return err
	}
	mode := strings.TrimSpace(strings.ToLower(c.QueryParam("mode")))
	if mode == "" {
		mode = "unlink"
	}
	ctx := c.Request().Context()
	switch mode {
	case "unlink":
		err = h.service.UnlinkPatient(ctx, patientID, doctorID)
	case "hard":
		err = h.service.DeletePatient(ctx, patientID, doctorID)
	default:
		return writeError(c, errormap.ErrBadRequest, "mode must be unlink or hard")
	}
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

// AdminListReceptionists handles GET /api/v1/admin/doctors/:doctorId/receptionists.
//
// @Summary      List a doctor's receptionists
// @Description  Admin-only: return RECEPTIONIST accounts scoped to the given doctor
// @Tags         admin-receptionists
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Success      200 {array} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/receptionists [get]
func (h *Handler) AdminListReceptionists(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	resp, err := h.service.ListReceptionistsForDoctor(c.Request().Context(), doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// AdminCreateReceptionist handles POST /api/v1/admin/doctors/:doctorId/receptionists.
//
// @Summary      Create a receptionist for a doctor
// @Description  Admin-only: mint a RECEPTIONIST scoped to the given doctor
// @Tags         admin-receptionists
// @Accept       json
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Param        body body user.CreateStaffRequest true "Staff payload"
// @Success      201 {object} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/receptionists [post]
func (h *Handler) AdminCreateReceptionist(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	var req CreateStaffRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	resp, err := h.service.CreateReceptionistForDoctor(c.Request().Context(), req, doctorID)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusCreated, resp)
}

// AdminUpdateReceptionist handles PUT /api/v1/admin/doctors/:doctorId/receptionists/:id.
//
// @Summary      Update a doctor's receptionist
// @Description  Admin-only: update a RECEPTIONIST scoped to the given doctor
// @Tags         admin-receptionists
// @Accept       json
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Param        id path string true "Receptionist user id"
// @Param        body body user.UpdateStaffRequest true "Staff payload"
// @Success      200 {object} user.UserResponse
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Failure      409 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/receptionists/{id} [put]
func (h *Handler) AdminUpdateReceptionist(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	receptionistID, err := parseScopedResourceID(c, "id")
	if err != nil {
		return err
	}
	var req UpdateStaffRequest
	if err := c.Bind(&req); err != nil {
		return writeError(c, errormap.ErrBadRequest, "invalid request body")
	}
	if err := c.Validate(req); err != nil {
		return writeError(c, errormap.ErrBadRequest, err.Error())
	}
	resp, err := h.service.UpdateReceptionist(c.Request().Context(), receptionistID, doctorID, req)
	if err != nil {
		return mapServiceError(c, err)
	}
	return c.JSON(http.StatusOK, resp)
}

// AdminDeleteReceptionist handles DELETE /api/v1/admin/doctors/:doctorId/receptionists/:id.
//
// @Summary      Delete a doctor's receptionist
// @Description  Admin-only: delete a RECEPTIONIST scoped to the given doctor
// @Tags         admin-receptionists
// @Produce      json
// @Param        doctorId path string true "Doctor user id"
// @Param        id path string true "Receptionist user id"
// @Success      204 "No Content"
// @Failure      400 {object} errormap.APIError
// @Failure      401 {object} errormap.APIError
// @Failure      403 {object} errormap.APIError
// @Failure      404 {object} errormap.APIError
// @Security     ApiKeyAuth
// @Router       /admin/doctors/{doctorId}/receptionists/{id} [delete]
func (h *Handler) AdminDeleteReceptionist(c echo.Context) error {
	doctorID, err := parseDoctorID(c)
	if err != nil {
		return err
	}
	receptionistID, err := parseScopedResourceID(c, "id")
	if err != nil {
		return err
	}
	if err := h.service.DeleteReceptionist(c.Request().Context(), receptionistID, doctorID); err != nil {
		return mapServiceError(c, err)
	}
	return c.NoContent(http.StatusNoContent)
}

// mapServiceError converts a service-layer error into the appropriate HTTP
// response, keeping the errormap JSON shape uniform across the API. It is the
// single point where domain errors are mapped to status codes.
func mapServiceError(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrUserAlreadyExists):
		return writeError(c, errormap.ErrConflict, err.Error())
	case errors.Is(err, ErrInvalidCredentials):
		return writeError(c, errormap.ErrUnauthorized, err.Error())
	case errors.Is(err, ErrUserNotFound), errors.Is(err, ErrDoctorNotFound):
		return writeError(c, errormap.ErrNotFound, err.Error())
	case errors.Is(err, ErrNotScopedToDoctor):
		return writeError(c, errormap.ErrForbidden, err.Error())
	case errors.Is(err, ErrInvalidRole):
		return writeError(c, errormap.ErrBadRequest, err.Error())
	default:
		// Anything else is treated as an internal failure; log it for diagnosis
		// but do not leak internals to the client.
		logger.Get().Error("user handler: unexpected service error", "error", err)
		return writeError(c, errormap.ErrInternal, err.Error())
	}
}

// writeError serializes an *errormap.APIError into the response, attaching an
// optional diagnostic detail to the Debug field. A fresh APIError is created
// each time so the package-level sentinels are never mutated concurrently.
func writeError(c echo.Context, apiErr *errormap.APIError, detail string) error {
	return c.JSON(apiErr.Code, errormap.New(apiErr.Code, apiErr.Message, detail))
}
