package previsit

import (
	"context"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

func TestCreateForAppointment_Idempotent(t *testing.T) {
	ctx := context.Background()
	svc := NewService(NewMemSessionStore(), NewMemMessageStore(), nil)

	appt := primitive.NewObjectID().Hex()
	patient := primitive.NewObjectID().Hex()
	doctor := primitive.NewObjectID().Hex()

	first, err := svc.CreateForAppointment(ctx, appt, patient, doctor)
	if err != nil {
		t.Fatalf("create: %v", err)
	}
	if first.Status != StatusPending {
		t.Fatalf("status=%s", first.Status)
	}
	second, err := svc.CreateForAppointment(ctx, appt, patient, doctor)
	if err != nil {
		t.Fatalf("create2: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("expected same session id, got %s vs %s", first.ID, second.ID)
	}
}

func TestGetByAppointment_RBAC(t *testing.T) {
	ctx := context.Background()
	svc := NewService(NewMemSessionStore(), NewMemMessageStore(), nil)

	appt := primitive.NewObjectID().Hex()
	patient := primitive.NewObjectID().Hex()
	doctor := primitive.NewObjectID().Hex()
	other := primitive.NewObjectID().Hex()

	created, err := svc.CreateForAppointment(ctx, appt, patient, doctor)
	if err != nil {
		t.Fatal(err)
	}
	// attach a report with flags
	sessStore := svc.sessions.(*memSessionStore)
	oid, _ := primitive.ObjectIDFromHex(created.ID)
	sess, _ := sessStore.FindByID(ctx, oid)
	sess.Report = &PreVisitReport{ChiefComplaint: "سردرد", NotableFlags: []string{"شدت بالا"}}
	_ = sessStore.Update(ctx, *sess)

	patView, err := svc.GetByAppointment(ctx, appt, patient, "PATIENT")
	if err != nil {
		t.Fatal(err)
	}
	if patView.Report == nil || len(patView.Report.NotableFlags) != 0 {
		t.Fatalf("patient should not see flags: %+v", patView.Report)
	}

	docView, err := svc.GetByAppointment(ctx, appt, doctor, "DOCTOR")
	if err != nil {
		t.Fatal(err)
	}
	if docView.Report == nil || len(docView.Report.NotableFlags) != 1 {
		t.Fatalf("doctor should see flags: %+v", docView.Report)
	}

	if _, err := svc.GetByAppointment(ctx, appt, other, "PATIENT"); err != ErrForbidden {
		t.Fatalf("expected forbidden, got %v", err)
	}
}

func TestExpireByAppointment(t *testing.T) {
	ctx := context.Background()
	svc := NewService(NewMemSessionStore(), NewMemMessageStore(), nil)
	appt := primitive.NewObjectID().Hex()
	patient := primitive.NewObjectID().Hex()
	doctor := primitive.NewObjectID().Hex()
	if _, err := svc.CreateForAppointment(ctx, appt, patient, doctor); err != nil {
		t.Fatal(err)
	}
	if err := svc.ExpireByAppointment(ctx, appt); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.GetByAppointment(ctx, appt, patient, "PATIENT"); err != ErrSessionNotFound {
		t.Fatalf("expected not found after expire, got %v", err)
	}
}
