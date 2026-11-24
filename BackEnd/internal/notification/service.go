// Package notification provides a mock notification service for the clinic
// appointment system.
//
// The package is intentionally backend-agnostic: it exposes a Notifier
// abstraction so the actual delivery channel (SMS, email, push, ...) can be
// swapped without touching the callers. The current default implementation,
// SmsService, is a mock that simply logs the would-be message via the
// application logger — there is no real SMS gateway integration.
package notification

import (
	"context"
	"fmt"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"clinic-api/pkg/logger"
)

// Notifier is the abstraction used to deliver messages to users.
// Implementations (e.g. SmsService, EmailService) are swappable so the
// system can fan out notifications without coupling callers to a channel.
type Notifier interface {
	Send(ctx context.Context, userID primitive.ObjectID, message string) error
}

// SmsService is a dummy SMS notifier that simply logs the would-be SMS.
// It satisfies Notifier and is safe for concurrent use (stateless).
type SmsService struct{}

// NewSmsService returns a new SmsService instance.
func NewSmsService() *SmsService { return &SmsService{} }

// Send logs the message as if it were delivered over SMS. It always succeeds
// and is therefore suitable for local development and tests.
func (s *SmsService) Send(ctx context.Context, userID primitive.ObjectID, message string) error {
	logger.Get().Info("notification: sms sent (mock)",
		"user_id", userID.Hex(),
		"channel", "sms",
		"message", message,
	)
	return nil
}

// Service is the notification orchestrator. It holds a Notifier (the delivery
// channel) and exposes domain-specific event functions so callers never deal
// with raw message formatting.
type Service struct {
	notifier   Notifier
	appBaseURL string
}

// NewService returns a new Service backed by the provided Notifier. appBaseURL
// is the public base URL of the patient-facing web app (no trailing slash);
// when empty, prescription SMS messages omit the download link.
func NewService(notifier Notifier, appBaseURL string) *Service {
	return &Service{
		notifier:   notifier,
		appBaseURL: strings.TrimRight(appBaseURL, "/"),
	}
}

// send safely dispatches a message through the configured notifier. A nil
// notifier is treated as a no-op so the rest of the system keeps running even
// when notifications are disabled. Any delivery error is logged and returned.
func (s *Service) send(ctx context.Context, patientID primitive.ObjectID, message string) error {
	if s == nil || s.notifier == nil {
		return nil
	}
	if err := s.notifier.Send(ctx, patientID, message); err != nil {
		logger.Get().Error("notification: failed to send",
			"user_id", patientID.Hex(),
			"error", err,
		)
		return err
	}
	return nil
}

// NotifyAppointmentConfirmation informs a patient that their appointment has
// been confirmed.
func (s *Service) NotifyAppointmentConfirmation(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time) error {
	logger.Get().Debug("notification: event fired",
		"event", "appointment_confirmation",
		"user_id", patientID.Hex(),
	)
	namePart := ""
	if doctorName != "" {
		namePart = " با " + doctorName
	}
	message := fmt.Sprintf("بیمار گرامی، نوبت شما%s تأیید شد.\nزمان: %s",
		namePart, appointmentTime.Format("2006-01-02 15:04"))
	return s.send(ctx, patientID, message)
}

// NotifyAppointmentCancellation informs a patient that their appointment has
// been cancelled.
func (s *Service) NotifyAppointmentCancellation(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time) error {
	logger.Get().Debug("notification: event fired",
		"event", "appointment_cancellation",
		"user_id", patientID.Hex(),
	)
	message := fmt.Sprintf("Your appointment with Dr. %s on %s has been cancelled.",
		doctorName, appointmentTime.Format("2006-01-02 15:04"))
	return s.send(ctx, patientID, message)
}

// NotifyAppointmentReminder reminds a patient of an upcoming appointment.
func (s *Service) NotifyAppointmentReminder(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time) error {
	logger.Get().Debug("notification: event fired",
		"event", "appointment_reminder",
		"user_id", patientID.Hex(),
	)
	message := fmt.Sprintf("Reminder: you have an appointment with Dr. %s on %s.",
		doctorName, appointmentTime.Format("2006-01-02 15:04"))
	return s.send(ctx, patientID, message)
}

// NotifyPreVisitInvite invites the patient to complete the AI pre-visit chat.
// Soft recommendation only — never blocks the visit.
func (s *Service) NotifyPreVisitInvite(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time, link string) error {
	logger.Get().Debug("notification: event fired",
		"event", "previsit_invite",
		"user_id", patientID.Hex(),
	)
	namePart := ""
	if doctorName != "" {
		namePart = " با " + doctorName
	}
	message := fmt.Sprintf(
		"بیمار گرامی، نوبت شما%s در %s تأیید شد. قبل از مراجعه می‌توانید با دستیار پیش‌ویزیت صحبت کنید تا گزارش آماده‌ای برای پزشکتان آماده شود.\nلینک: %s",
		namePart,
		appointmentTime.Format("2006-01-02 15:04"),
		link,
	)
	return s.send(ctx, patientID, message)
}

// NotifyWaitingListTurn notifies a patient that a slot opened up from the
// waiting list and asks them to confirm.
func (s *Service) NotifyWaitingListTurn(ctx context.Context, patientID primitive.ObjectID, doctorName string, appointmentTime time.Time) error {
	logger.Get().Debug("notification: event fired",
		"event", "waiting_list_turn",
		"user_id", patientID.Hex(),
	)
	message := fmt.Sprintf("Good news! A slot with Dr. %s on %s opened up. Please confirm.",
		doctorName, appointmentTime.Format("2006-01-02 15:04"))
	return s.send(ctx, patientID, message)
}

// NotifyPaymentSuccess informs a patient that a payment has succeeded.
func (s *Service) NotifyPaymentSuccess(ctx context.Context, patientID primitive.ObjectID, amount int64, currency string) error {
	logger.Get().Debug("notification: event fired",
		"event", "payment_success",
		"user_id", patientID.Hex(),
	)
	message := fmt.Sprintf("Your payment of %d %s was successful.", amount, currency)
	return s.send(ctx, patientID, message)
}

// prescriptionLink builds the patient-portal deep link for a prescription.
func (s *Service) prescriptionLink(prescriptionID primitive.ObjectID) string {
	if s == nil || s.appBaseURL == "" {
		return ""
	}
	return fmt.Sprintf("%s/prescriptions?id=%s", s.appBaseURL, prescriptionID.Hex())
}

// NotifyPrescriptionIssued informs a patient that a new prescription has been
// issued for them. The message is formatted here in the Service (the transport
// Notifier stays a dumb pipe), mirroring how NotifyAppointmentConfirmation works.
func (s *Service) NotifyPrescriptionIssued(ctx context.Context, patientID primitive.ObjectID, doctorName string, prescriptionID primitive.ObjectID) error {
	logger.Get().Debug("notification: event fired",
		"event", "prescription_issued",
		"user_id", patientID.Hex(),
		"prescription_id", prescriptionID.Hex(),
	)
	message := fmt.Sprintf("بیمار گرامی،\nنسخهٔ شما توسط %s صادر شد.", doctorName)
	if link := s.prescriptionLink(prescriptionID); link != "" {
		message += fmt.Sprintf("\nمشاهده و دانلود نسخه:\n%s", link)
	}
	return s.send(ctx, patientID, message)
}
