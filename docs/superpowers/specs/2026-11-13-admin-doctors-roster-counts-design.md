# Admin doctors list: patient & receptionist counts

**Date:** 2026-11-13  
**Status:** Approved  
**Endpoint:** `GET /api/v1/clinics/doctors`  
**UI:** `/admin/doctors`

## Goal

Show two new columns on the admin doctors list — **منشی‌ها** and **بیماران** — with counts that match the existing roster detail pages (`/admin/doctors/[id]/receptionists` and `/admin/doctors/[id]/patients`).

## Decisions

| Decision | Choice |
|---|---|
| Data source | Same list API: `GET /api/v1/clinics/doctors` |
| Count semantics | Match `ListPatients` / `ListReceptionists` (option 2) |
| Enrichment scope | List endpoint only (single-profile GETs stay without counts / zero) |
| Failure mode | Best-effort: log warn, leave counts at 0, still return doctors |

## Backend

### Response fields

Extend `DoctorProfileResponse` (`BackEnd/internal/clinic/clinic.go`):

- `patient_count` (`int`, JSON `patient_count`)
- `receptionist_count` (`int`, JSON `receptionist_count`)

Populate in `ListDoctorProfiles` after the existing `enrichProfiles` pass. Do not require counts on create/update/get-by-id paths.

### Cross-domain counting (Clean Architecture)

Clinic must not import `internal/user`. Extend `clinic.UserReader` with batch count methods, implemented by `clinicUserReader` in `cmd/clinic-api/bootstrap/adapter.go`:

1. **`CountReceptionistsByEmployerIDs(ctx, doctorUserIDs []ObjectID) (map[ObjectID]int, error)`**  
   Count users where `role = RECEPTIONIST` and `employer_id ∈ doctorUserIDs`. Same filter as `ListReceptionists` / `ListReceptionistsForDoctor`.

2. **`CountPatientsByDoctorIDs(ctx, doctorUserIDs []ObjectID) (map[ObjectID]int, error)`**  
   Same merge rules as `user.Service.ListPatients` for each doctor, batched:
   - Patients with `role = PATIENT` and `employer_id` in the doctor set
   - Plus distinct appointment patient IDs for those doctors (appointment linkage)
   - Minus patients whose `roster_excluded_doctor_ids` contains that doctor
   - Deduplicate per doctor so employer + appointment overlap counts once

Implementation should prefer aggregation / few queries over N×`ListPatients` calls.

### Service wiring

In `clinic.Service.ListDoctorProfiles` (or a sibling `enrichRosterCounts`):

1. Collect all profile `user_id`s  
2. Call both count methods once  
3. Assign `PatientCount` / `ReceptionistCount` on each response  
4. On reader error: warn-log and leave zeros (mirror `enrichProfiles`)

## Frontend

### Types & API mapping

- Add `patient_count: number` and `receptionist_count: number` to `AdminDoctor` (`FrontEnd/src/types/admin-doctor.ts`).
- Map them in `toAdminDoctor` from `DoctorProfileResponse` (`FrontEnd/src/lib/admin-doctor-api.ts`). Default missing fields to `0` for mock/legacy responses.

### UI (`FrontEnd/src/app/admin/doctors/page.tsx`)

**Desktop table** — two numeric columns before وضعیت (or after تخصص), right-aligned with `tabular-nums`:

- Header: منشی‌ها / بیماران  
- Cell: count; wrap in `Link` to `/admin/doctors/${doc.id}/receptionists` and `.../patients`

**Mobile cards** — show both counts in the muted meta row (same links).

No new hooks or queries: counts arrive with `useAdminDoctors`.

## Out of scope

- Server-side search/filter changes  
- Counts on single-doctor GET  
- Changing roster CRUD or ListPatients semantics  
- Sorting/filtering the doctors table by these counts

## Test plan

- [ ] Backend: receptionist count matches admin receptionists list length for a doctor  
- [ ] Backend: patient count matches admin patients list (employer-only, appointment-only, excluded, overlap)  
- [ ] API: `GET /api/v1/clinics/doctors` includes both fields per row  
- [ ] UI: `/admin/doctors` shows columns; links open correct roster pages  
- [ ] UI: mobile cards show both numbers  
- [ ] Failure: if count query fails, doctors still load with 0s  
