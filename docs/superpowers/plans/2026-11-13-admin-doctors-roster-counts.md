# Admin Doctors Roster Counts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface `patient_count` and `receptionist_count` on `GET /api/v1/clinics/doctors` and show them as columns on `/admin/doctors`, matching roster detail pages.

**Architecture:** Extend `clinic.UserReader` with batch count methods implemented by `clinicUserReader` in bootstrap (keeps `clinic` free of `internal/user`). `ListDoctorProfiles` fills the new response fields after identity enrichment. Frontend maps the fields into `AdminDoctor` and renders linked numeric columns.

**Tech Stack:** Go (Echo, MongoDB), Next.js App Router, TanStack Query, shadcn Table.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-13-admin-doctors-roster-counts-design.md`
- Counts match `user.Service.ListPatients` / `ListReceptionists` semantics (option 2)
- Enrich **list only**; single-profile GETs may leave counts at 0
- Count failures: warn-log, leave 0, still return doctors (mirror `enrichProfiles`)
- `clinic` must not import `internal/user` — counts via `UserReader` + bootstrap adapter
- JSON keys: `patient_count`, `receptionist_count` (snake_case)

---

## File map

| File | Responsibility |
|------|----------------|
| `BackEnd/internal/clinic/clinic.go` | DTO fields + `UserReader` method signatures |
| `BackEnd/internal/clinic/service.go` | `enrichRosterCounts` called from `ListDoctorProfiles` |
| `BackEnd/internal/clinic/service_roster_counts_test.go` | Unit tests with fake `UserReader` |
| `BackEnd/cmd/clinic-api/bootstrap/adapter.go` | `CountReceptionists*` / `CountPatients*` on `clinicUserReader` |
| `BackEnd/cmd/clinic-api/bootstrap/app.go` | Wire appointments collection into reader if needed |
| `FrontEnd/src/types/admin-doctor.ts` | `AdminDoctor` count fields |
| `FrontEnd/src/lib/admin-doctor-api.ts` | Response type + `toAdminDoctor` + mock fixtures |
| `FrontEnd/src/app/admin/doctors/page.tsx` | Table + mobile columns/links |

---

### Task 1: Backend DTO, UserReader, list enrichment + unit test

**Files:**
- Modify: `BackEnd/internal/clinic/clinic.go`
- Modify: `BackEnd/internal/clinic/service.go`
- Create: `BackEnd/internal/clinic/service_roster_counts_test.go`

**Interfaces:**
- Consumes: existing `UserReader`, `ListDoctorProfiles`
- Produces:

```go
// on DoctorProfileResponse
PatientCount      int `json:"patient_count"`
ReceptionistCount int `json:"receptionist_count"`

// on UserReader
CountReceptionistsByEmployerIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error)
CountPatientsByDoctorIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error)
```

- [ ] **Step 1: Write the failing unit test**

Create `BackEnd/internal/clinic/service_roster_counts_test.go`:

```go
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
	results := []*DoctorProfileResponse{{UserID: d1, PatientCount: 99, ReceptionistCount: 99}}
	// Reset to zero before enrich in production; here we verify enrich does not panic and zeros/leaves on error.
	results[0].PatientCount = 0
	results[0].ReceptionistCount = 0
	s.enrichRosterCounts(context.Background(), results)
	if results[0].PatientCount != 0 || results[0].ReceptionistCount != 0 {
		t.Fatalf("expected zeros on error, got (%d,%d)", results[0].PatientCount, results[0].ReceptionistCount)
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd BackEnd && go test ./internal/clinic/ -run TestEnrichRosterCounts -count=1
```

Expected: FAIL (missing methods / `enrichRosterCounts` undefined, or compile error on `UserReader`).

- [ ] **Step 3: Extend DTO and UserReader**

In `BackEnd/internal/clinic/clinic.go`, add to `DoctorProfileResponse`:

```go
PatientCount      int `json:"patient_count"`
ReceptionistCount int `json:"receptionist_count"`
```

Extend `UserReader`:

```go
CountReceptionistsByEmployerIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error)
CountPatientsByDoctorIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error)
```

- [ ] **Step 4: Implement `enrichRosterCounts` and call it from list**

In `BackEnd/internal/clinic/service.go`, add:

```go
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
```

At the end of `ListDoctorProfiles`, after `s.enrichProfiles(ctx, results)`:

```go
s.enrichRosterCounts(ctx, results)
```

- [ ] **Step 5: Temporary stub on adapter so the package builds**

Until Task 2, `clinicUserReader` will not compile. Add stub methods in `BackEnd/cmd/clinic-api/bootstrap/adapter.go` that return empty maps (no error) so `go test ./internal/clinic` and `go build` work:

```go
func (r *clinicUserReader) CountReceptionistsByEmployerIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	return map[primitive.ObjectID]int{}, nil
}
func (r *clinicUserReader) CountPatientsByDoctorIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	return map[primitive.ObjectID]int{}, nil
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
cd BackEnd && go test ./internal/clinic/ -run TestEnrichRosterCounts -count=1
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add BackEnd/internal/clinic/clinic.go BackEnd/internal/clinic/service.go BackEnd/internal/clinic/service_roster_counts_test.go BackEnd/cmd/clinic-api/bootstrap/adapter.go
git commit -m "$(cat <<'EOF'
feat(clinic): enrich doctor list with roster count fields

EOF
)"
```

---

### Task 2: Implement real batch counts on `clinicUserReader`

**Files:**
- Modify: `BackEnd/cmd/clinic-api/bootstrap/adapter.go`
- Modify: `BackEnd/cmd/clinic-api/bootstrap/app.go` (only if appointments collection must be injected; prefer reading via `r.repo.Collection().Database().Collection("appointments")` like `user.Service.distinctAppointmentPatientIDs`)

**Interfaces:**
- Consumes: `user.RoleReceptionist`, `user.RolePatient`, users + appointments Mongo collections
- Produces: real implementations of the two `UserReader` count methods from Task 1

- [ ] **Step 1: Replace receptionist stub with aggregation/count query**

```go
func (r *clinicUserReader) CountReceptionistsByEmployerIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	out := make(map[primitive.ObjectID]int, len(doctorUserIDs))
	if len(doctorUserIDs) == 0 {
		return out, nil
	}
	for _, id := range doctorUserIDs {
		out[id] = 0
	}
	users, err := r.repo.FindAll(ctx, bson.M{
		"role":        user.RoleReceptionist,
		"employer_id": bson.M{"$in": doctorUserIDs},
	})
	if err != nil {
		return nil, err
	}
	for _, u := range users {
		out[u.EmployerID]++
	}
	return out, nil
}
```

- [ ] **Step 2: Replace patient stub with ListPatients-equivalent batch merge**

Semantics (must match `user.Service.ListPatients`):

1. Load patients with `role=PATIENT` and `employer_id ∈ doctorUserIDs`.
2. For each such patient, if `doctorID` is **not** in `RosterExcludedDoctorIDs`, count toward that `employer_id` and mark `(doctorID, patientID)` seen.
3. Load appointments where `doctor_id ∈ doctorUserIDs` (project `doctor_id`, `patient_id`). For each pair not already seen, collect missing patient IDs.
4. Fetch those patients (`role=PATIENT`, `_id $in missing`). For each appointment pair, if patient exists and doctor not in exclusions and not already counted, increment.
5. Return `map[doctorUserID]int` with every input id present (0 if none).

Sketch:

```go
func (r *clinicUserReader) CountPatientsByDoctorIDs(ctx context.Context, doctorUserIDs []primitive.ObjectID) (map[primitive.ObjectID]int, error) {
	out := make(map[primitive.ObjectID]int, len(doctorUserIDs))
	seen := make(map[primitive.ObjectID]map[primitive.ObjectID]struct{}, len(doctorUserIDs))
	for _, id := range doctorUserIDs {
		out[id] = 0
		seen[id] = map[primitive.ObjectID]struct{}{}
	}
	if len(doctorUserIDs) == 0 {
		return out, nil
	}

	byEmployer, err := r.repo.FindAll(ctx, bson.M{
		"role":        user.RolePatient,
		"employer_id": bson.M{"$in": doctorUserIDs},
	})
	if err != nil {
		return nil, err
	}
	for _, u := range byEmployer {
		docID := u.EmployerID
		if _, ok := out[docID]; !ok {
			continue
		}
		if containsOID(u.RosterExcludedDoctorIDs, docID) {
			continue
		}
		if _, ok := seen[docID][u.ID]; ok {
			continue
		}
		seen[docID][u.ID] = struct{}{}
		out[docID]++
	}

	type apptPair struct{ DoctorID, PatientID primitive.ObjectID }
	cur, err := r.repo.Collection().Database().Collection("appointments").Find(
		ctx,
		bson.M{"doctor_id": bson.M{"$in": doctorUserIDs}},
		options.Find().SetProjection(bson.M{"doctor_id": 1, "patient_id": 1}),
	)
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var pairs []apptPair
	missingSet := map[primitive.ObjectID]struct{}{}
	for cur.Next(ctx) {
		var row struct {
			DoctorID  primitive.ObjectID `bson:"doctor_id"`
			PatientID primitive.ObjectID `bson:"patient_id"`
		}
		if err := cur.Decode(&row); err != nil {
			return nil, err
		}
		if _, ok := out[row.DoctorID]; !ok {
			continue
		}
		if _, ok := seen[row.DoctorID][row.PatientID]; ok {
			continue
		}
		pairs = append(pairs, apptPair{row.DoctorID, row.PatientID})
		missingSet[row.PatientID] = struct{}{}
	}
	if err := cur.Err(); err != nil {
		return nil, err
	}

	if len(missingSet) == 0 {
		return out, nil
	}
	missing := make([]primitive.ObjectID, 0, len(missingSet))
	for id := range missingSet {
		missing = append(missing, id)
	}
	extra, err := r.repo.FindAll(ctx, bson.M{
		"role": user.RolePatient,
		"_id":  bson.M{"$in": missing},
	})
	if err != nil {
		return nil, err
	}
	byID := make(map[primitive.ObjectID]*user.User, len(extra))
	for _, u := range extra {
		byID[u.ID] = u
	}
	for _, p := range pairs {
		u := byID[p.PatientID]
		if u == nil {
			continue
		}
		if containsOID(u.RosterExcludedDoctorIDs, p.DoctorID) {
			continue
		}
		if _, ok := seen[p.DoctorID][p.PatientID]; ok {
			continue
		}
		seen[p.DoctorID][p.PatientID] = struct{}{}
		out[p.DoctorID]++
	}
	return out, nil
}

func containsOID(ids []primitive.ObjectID, id primitive.ObjectID) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}
```

Add imports as needed: `user`, `options` from mongo-driver.

- [ ] **Step 3: Compile check**

```bash
cd BackEnd && go build ./cmd/clinic-api/...
```

Expected: success (no errors).

- [ ] **Step 4: Manual API check (server must be running)**

```bash
curl -sS http://localhost:8080/api/v1/clinics/doctors | head -c 2000
```

Expected: each object includes `"patient_count":N` and `"receptionist_count":N`. Spot-check one doctor against:

- `GET /api/v1/admin/doctors/{user_id}/patients` → `length == patient_count`
- `GET /api/v1/admin/doctors/{user_id}/receptionists` → `length == receptionist_count`

(Use an admin JWT if those routes require auth.)

- [ ] **Step 5: Commit**

```bash
git add BackEnd/cmd/clinic-api/bootstrap/adapter.go BackEnd/cmd/clinic-api/bootstrap/app.go
git commit -m "$(cat <<'EOF'
feat(clinic): batch-count patients and receptionists for doctor list

EOF
)"
```

---

### Task 3: Frontend types and API mapping

**Files:**
- Modify: `FrontEnd/src/types/admin-doctor.ts`
- Modify: `FrontEnd/src/lib/admin-doctor-api.ts`

**Interfaces:**
- Consumes: API `patient_count` / `receptionist_count`
- Produces: `AdminDoctor.patient_count` / `AdminDoctor.receptionist_count`

- [ ] **Step 1: Extend `AdminDoctor`**

In `FrontEnd/src/types/admin-doctor.ts`, add to the interface:

```ts
  /** Patients linked to this doctor (admin roster + appointments − exclusions). */
  patient_count: number;
  /** Receptionists with employer_id = this doctor's user_id. */
  receptionist_count: number;
```

- [ ] **Step 2: Extend local `DoctorProfileResponse` and `toAdminDoctor`**

In `FrontEnd/src/lib/admin-doctor-api.ts`:

```ts
interface DoctorProfileResponse {
  // ...existing fields...
  patient_count?: number;
  receptionist_count?: number;
}
```

In `toAdminDoctor`:

```ts
    patient_count: p.patient_count ?? 0,
    receptionist_count: p.receptionist_count ?? 0,
```

- [ ] **Step 3: Update mock fixtures**

Add `patient_count` / `receptionist_count` (e.g. `0`) to every object in the `DOCTORS` array and any mock create path that builds an `AdminDoctor`, so TypeScript stays green when mock mode is used.

- [ ] **Step 4: Typecheck**

```bash
cd FrontEnd && npx tsc --noEmit -p tsconfig.json 2>&1 | head -40
```

Expected: no errors related to `patient_count` / `receptionist_count` (fix any new ones introduced by this task).

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/types/admin-doctor.ts FrontEnd/src/lib/admin-doctor-api.ts
git commit -m "$(cat <<'EOF'
feat(frontend): map doctor roster counts from clinics API

EOF
)"
```

---

### Task 4: Admin doctors UI columns

**Files:**
- Modify: `FrontEnd/src/app/admin/doctors/page.tsx`

**Interfaces:**
- Consumes: `AdminDoctor.patient_count`, `AdminDoctor.receptionist_count`
- Produces: desktop table columns + mobile meta + links to roster pages

- [ ] **Step 1: Add table headers**

In the desktop `<TableHeader>` row, after تخصص (or before وضعیت), insert:

```tsx
                  <TableHead className="text-end">منشی‌ها</TableHead>
                  <TableHead className="text-end">بیماران</TableHead>
```

- [ ] **Step 2: Add table cells with links**

Inside each desktop `<TableRow>`, after the specialty cell:

```tsx
                    <TableCell className="text-end tabular-nums">
                      <Link
                        href={`/admin/doctors/${doc.id}/receptionists`}
                        className="text-foreground underline-offset-4 hover:underline"
                      >
                        {doc.receptionist_count}
                      </Link>
                    </TableCell>
                    <TableCell className="text-end tabular-nums">
                      <Link
                        href={`/admin/doctors/${doc.id}/patients`}
                        className="text-foreground underline-offset-4 hover:underline"
                      >
                        {doc.patient_count}
                      </Link>
                    </TableCell>
```

- [ ] **Step 3: Mobile card meta**

In the mobile card block, after the phone/visit row, add:

```tsx
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <Link
                      href={`/admin/doctors/${doc.id}/receptionists`}
                      className="hover:underline"
                    >
                      منشی‌ها {doc.receptionist_count}
                    </Link>
                    <Link
                      href={`/admin/doctors/${doc.id}/patients`}
                      className="hover:underline"
                    >
                      بیماران {doc.patient_count}
                    </Link>
                  </div>
```

- [ ] **Step 4: Manual UI check**

Open `http://localhost:3000/admin/doctors`. Confirm:

- Two new columns show numbers
- Numbers match detail pages for at least one doctor
- Links navigate correctly
- Mobile layout shows both counts

- [ ] **Step 5: Commit**

```bash
git add FrontEnd/src/app/admin/doctors/page.tsx
git commit -m "$(cat <<'EOF'
feat(admin): show patient and receptionist counts on doctors table

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `patient_count` / `receptionist_count` on list API | 1 + 2 |
| List-only enrichment | 1 (`ListDoctorProfiles` only) |
| Receptionist = employer + RECEPTIONIST | 2 |
| Patient = employer + appointments − exclusions | 2 |
| Best-effort zero on count error | 1 (unit test) |
| Clean Architecture via UserReader | 1 + 2 |
| Frontend type + map | 3 |
| Desktop + mobile UI + links | 4 |

## Self-review notes

- No TBD placeholders.
- Method names consistent: `CountReceptionistsByEmployerIDs`, `CountPatientsByDoctorIDs`, `enrichRosterCounts`.
- Adapter uses same appointments access pattern as `distinctAppointmentPatientIDs` (no new app.go field required unless implementer prefers explicit injection).
