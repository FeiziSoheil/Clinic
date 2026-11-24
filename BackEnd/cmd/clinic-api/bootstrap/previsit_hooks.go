package bootstrap

import (
	"context"
	"errors"
	"fmt"
	"time"

	"clinic-api/internal/booking"
	"clinic-api/internal/notification"
	"clinic-api/internal/previsit"
	"clinic-api/pkg/database"
	"clinic-api/pkg/logger"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

// previsitLifecycleAdapter implements booking.PreVisitLifecycle.
type previsitLifecycleAdapter struct {
	svc     *previsit.Service
	notify  *notification.Service
	baseURL string
}

func (a *previsitLifecycleAdapter) OnBooked(ctx context.Context, appointmentID, patientID, doctorID string) {
	if a == nil || a.svc == nil {
		return
	}
	if _, err := a.svc.CreateForAppointment(ctx, appointmentID, patientID, doctorID); err != nil {
		logger.Get().Warn("previsit: create session on book failed",
			"appointment_id", appointmentID, "error", err)
	}
}

func (a *previsitLifecycleAdapter) OnCancelled(ctx context.Context, appointmentID string) {
	if a == nil || a.svc == nil {
		return
	}
	if err := a.svc.ExpireByAppointment(ctx, appointmentID); err != nil {
		logger.Get().Warn("previsit: expire on cancel failed",
			"appointment_id", appointmentID, "error", err)
	}
}

func (a *previsitLifecycleAdapter) OnConfirmed(ctx context.Context, appointmentID, patientID, doctorName string, appointmentTime time.Time) {
	if a == nil || a.notify == nil || a.baseURL == "" {
		return
	}
	oid, err := primitive.ObjectIDFromHex(patientID)
	if err != nil {
		return
	}
	link := fmt.Sprintf("%s/appointments/previsit/%s", a.baseURL, appointmentID)
	if err := a.notify.NotifyPreVisitInvite(ctx, oid, doctorName, appointmentTime, link); err != nil {
		logger.Get().Warn("previsit: invite notify failed",
			"appointment_id", appointmentID, "error", err)
	}
}

// bookingAppointmentParties adapts the appointments repo for previsit EnsureSession.
type bookingAppointmentParties struct {
	repo *database.Repository[booking.Appointment]
}

func (a *bookingAppointmentParties) GetAppointmentParties(ctx context.Context, appointmentID string) (patientID, doctorID string, err error) {
	oid, err := primitive.ObjectIDFromHex(appointmentID)
	if err != nil {
		return "", "", previsit.ErrInvalidID
	}
	appt, err := a.repo.FindByID(ctx, oid)
	if err != nil {
		if errors.Is(err, database.ErrNotFound) {
			return "", "", previsit.ErrSessionNotFound
		}
		return "", "", err
	}
	return appt.PatientID.Hex(), appt.DoctorID.Hex(), nil
}
