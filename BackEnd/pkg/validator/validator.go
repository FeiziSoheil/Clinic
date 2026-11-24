// Package validator wires the go-playground/validator library into Echo so the
// per-field "validate" struct tags used across the DTOs are enforced on every
// request before it reaches a service.
//
// Per the project's Clean Architecture rules this package lives in pkg/ and
// therefore MUST NOT import anything from internal/.
package validator

import (
	"github.com/go-playground/validator/v10"
	"github.com/labstack/echo/v4"
)

// CustomValidator adapts go-playground/validator to Echo's Validator
// interface. Echo stores a single Validator on the engine and calls its
// Validate method for every c.Validate(req) invocation in the handlers.
type CustomValidator struct {
	// validator is the underlying go-playground validator instance. It is safe
	// for concurrent use, so a single instance can be shared across all
	// requests.
	validator *validator.Validate
}

// New constructs a CustomValidator backed by a fresh validator.Validate
// instance. It is the constructor used by bootstrap when wiring the Echo
// engine.
func New() *CustomValidator {
	return &CustomValidator{validator: validator.New()}
}

// Validate runs the underlying validator against i and returns the first
// validation error (if any). Echo requires this method so a CustomValidator
// satisfies the echo.Validator interface.
func (cv *CustomValidator) Validate(i interface{}) error {
	if err := cv.validator.Struct(i); err != nil {
		// Echo treats any non-nil error returned here as an HTTP 400 by default
		// (when surfaced via echo.HTTPError); handlers in this project call
		// c.Validate directly and map the error to errormap.ErrBadRequest.
		return err
	}
	return nil
}

// Compile-time assertion that CustomValidator satisfies Echo's Validator
// interface so an accidental signature drift is caught at build time.
var _ echo.Validator = (*CustomValidator)(nil)
