package clinic

import (
	"context"
	"errors"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type fakeUserReader struct {
	users          map[primitive.ObjectID]*UserInfo
	receptionistOf map[primitive.ObjectID]int
	patientOf      map[primitive.ObjectID]int
	countErr       error
}

func (f *fakeUserReader) GetByID(ctx context.Context, id primitive.ObjectID) (*UserInfo, error) {
	return f.users[id], nil
}
func (f *fakeUserReader) FindByIDs(ctx context.Context, ids []primitive.ObjectID) (map[primitive.ObjectID]*UserInfo, error) {
	out := make(map[primitive.ObjectID]*UserInfo)
	for _, id := range ids {
		if u, ok := f.users[id]; ok {
			out[id] = u
		}
	}
	return out, nil
}
func (f *fakeUserReader) CountReceptionistsByEmployerIDs(ctx context.Context, ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	if f.countErr != nil {
		return nil, f.countErr
	}
	out := make(map[primitive.ObjectID]int)
	for _, id := range ids {
		out[id] = f.receptionistOf[id]
	}
	return out, nil
}
func (f *fakeUserReader) CountPatientsByDoctorIDs(ctx context.Context, ids []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	if f.countErr != nil {
		return nil, f.countErr
	}
	out := make(map[primitive.ObjectID]int)
	for _, id := range ids {
		out[id] = f.patientOf[id]
	}
	return out, nil
}

func TestEnrichRosterCounts_assignsCounts(t *testing.T) {
	d1 := primitive.NewObjectID()
	d2 := primitive.NewObjectID()
	reader := &fakeUserReader{
		receptionistOf: map[primitive.ObjectID]int{d1: 2, d2: 0},
		patientOf:      map[primitive.ObjectID]int{d1: 5, d2: 1},
	}
	s := NewService(nil, nil, reader)
	results := []*DoctorProfileResponse{
		{UserID: d1},
		{UserID: d2},
	}
	s.enrichRosterCounts(context.Background(), results)
	if results[0].ReceptionistCount != 2 || results[0].PatientCount != 5 {
		t.Fatalf("d1 counts = (%d,%d), want (2,5)", results[0].ReceptionistCount, results[0].PatientCount)
	}
	if results[1].ReceptionistCount != 0 || results[1].PatientCount != 1 {
		t.Fatalf("d2 counts = (%d,%d), want (0,1)", results[1].ReceptionistCount, results[1].PatientCount)
	}
}

func TestEnrichRosterCounts_countErrorLeavesZero(t *testing.T) {
	d1 := primitive.NewObjectID()
	reader := &fakeUserReader{countErr: errors.New("db down")}
	s := NewService(nil, nil, reader)
	results := []*DoctorProfileResponse{{UserID: d1, PatientCount: 0, ReceptionistCount: 0}}
	s.enrichRosterCounts(context.Background(), results)
	if results[0].PatientCount != 0 || results[0].ReceptionistCount != 0 {
		t.Fatalf("expected zeros on error, got (%d,%d)", results[0].PatientCount, results[0].ReceptionistCount)
	}
}
