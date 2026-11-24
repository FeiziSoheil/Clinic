/**
 * Admin doctor & shift CRUD operations.
 *
 * Mirrors the `USE_MOCK` + `delay()` pattern of
 * [`doctor-api.ts`](src/lib/doctor-api.ts). Until the admin doctor-management
 * endpoints are wired into the backend, every function resolves against
 * deterministic in-memory fixtures so the `/admin/doctors` screens work fully
 * without a backend. Flip {@link USE_ADMIN_DOCTOR_MOCK} to `false` to hit the
 * real endpoints listed per function.
 *
 * Inferred real endpoints (subject to backend finalization):
 *  - `GET    /v1/clinics/doctors`          list admin doctors
 *  - `GET    /v1/clinics/doctors/:id`      fetch one admin doctor
 *  - `POST   /v1/clinics/doctors`          create doctor (user + profile)
 *  - `PUT    /v1/clinics/doctors/:id`      update doctor
 *  - `DELETE /v1/clinics/doctors/:id`      delete doctor
 *  - `GET    /v1/schedule/doctors/:id/shifts`   list weekly shifts
 *  - `POST   /v1/schedule/doctors/:id/shifts`   upsert weekly shift
 *  - `DELETE /v1/schedule/doctors/:id/shifts/:shiftId`  remove weekly shift
 */

import { apiClient } from "./api";
import type {
  AdminDoctor,
  AdminDoctorFilters,
  CreateDoctorRequest,
  UpdateDoctorRequest,
  UpsertShiftRequest,
  WeeklyShift,
} from "@/types/admin-doctor";

/**
 * Master switch for the doctor CRUD mock layer.
 *
 * `false` (default): doctor list/create/update/delete hit the real backend
 *   (`/v1/clinics/doctors` + `/v1/admin/users`). This is what persists data to
 *   MongoDB, which is why the flag is now off.
 */
export const USE_ADMIN_DOCTOR_MOCK = false;

/**
 * Master switch for the weekly-shifts mock layer.
 *
 * The backend currently exposes generic shift endpoints (`/v1/schedule/shifts`)
 * rather than the doctor-scoped ones assumed by the admin UI, so the weekly
 * shifts editor still resolves against in-memory fixtures. Flip to `false` once
 * doctor-scoped shift endpoints land.
 */
export const USE_ADMIN_SHIFT_MOCK = true;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Monotonic counter for generating stable-ish ids in the mock layer. */
let idSeq = 1000;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${idSeq.toString(16).padStart(6, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  Reference data (specialties)                                              */
/* -------------------------------------------------------------------------- */

/** Common specialties surfaced in the doctor form select. */
export const COMMON_SPECIALTIES: string[] = [
  "Cardiology",
  "Dermatology",
  "Neurology",
  "Pediatrics",
  "Orthopedics",
  "Psychiatry",
  "General Practice",
  "Ophthalmology",
];

/* -------------------------------------------------------------------------- */
/*  In-memory fixtures                                                        */
/* -------------------------------------------------------------------------- */

/** Mutable in-memory store so mock mutations persist across reads. */
const DOCTORS: AdminDoctor[] = [
  {
    id: "doc-profile-1",
    user_id: "user-1",
    first_name: "Sara",
    last_name: "Ahmadi",
    phone: "+989121000001",
    email: "sara.ahmadi@clinick.test",
    specialty: "Cardiology",
    medical_system_number: "MSN-10001",
    visit_duration_minutes: 20,
    visit_fee: 200000,
    status: "ACTIVE",
    is_active: true,
    patient_count: 0,
    receptionist_count: 0,
  },
  {
    id: "doc-profile-2",
    user_id: "user-2",
    first_name: "Reza",
    last_name: "Mohammadi",
    phone: "+989121000002",
    email: "reza.mohammadi@clinick.test",
    specialty: "Neurology",
    medical_system_number: "MSN-10002",
    visit_duration_minutes: 30,
    visit_fee: 250000,
    status: "ACTIVE",
    is_active: true,
    patient_count: 0,
    receptionist_count: 0,
  },
  {
    id: "doc-profile-3",
    user_id: "user-3",
    first_name: "Maryam",
    last_name: "Hosseini",
    phone: "+989121000003",
    email: "maryam.hosseini@clinick.test",
    specialty: "Dermatology",
    medical_system_number: "MSN-10003",
    visit_duration_minutes: 15,
    visit_fee: 150000,
    status: "INACTIVE",
    is_active: false,
    patient_count: 0,
    receptionist_count: 0,
  },
  {
    id: "doc-profile-4",
    user_id: "user-4",
    first_name: "Ali",
    last_name: "Karimi",
    phone: "+989121000004",
    email: "ali.karimi@clinick.test",
    specialty: "Pediatrics",
    medical_system_number: "MSN-10004",
    visit_duration_minutes: 25,
    visit_fee: 180000,
    status: "ACTIVE",
    is_active: true,
    patient_count: 0,
    receptionist_count: 0,
  },
];

/** Mutable in-memory weekly-shift store, keyed by doctor profile id. */
const SHIFTS: Record<string, WeeklyShift[]> = {
  "doc-profile-1": [
    { id: "shift-1", doctor_id: "doc-profile-1", day_of_week: "SATURDAY", start_time: "09:00", end_time: "13:00", is_active: true },
    { id: "shift-2", doctor_id: "doc-profile-1", day_of_week: "MONDAY", start_time: "16:00", end_time: "20:00", is_active: true },
  ],
  "doc-profile-2": [
    { id: "shift-3", doctor_id: "doc-profile-2", day_of_week: "SUNDAY", start_time: "08:00", end_time: "14:00", is_active: true },
  ],
  "doc-profile-3": [],
  "doc-profile-4": [
    { id: "shift-4", doctor_id: "doc-profile-4", day_of_week: "TUESDAY", start_time: "10:00", end_time: "18:00", is_active: true },
  ],
};

/** Case-insensitive containment test for client-side filtering. */
function matches(doc: AdminDoctor, filters?: AdminDoctorFilters): boolean {
  if (!filters) return true;
  if (filters.specialty && doc.specialty !== filters.specialty) return false;
  if (filters.search) {
    const q = filters.search.toLowerCase();
    const haystack =
      `${doc.first_name} ${doc.last_name} ${doc.specialty} ${doc.phone} ${doc.medical_system_number}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/* -------------------------------------------------------------------------- */
/*  Backend response shapes + mapping                                         */
/* -------------------------------------------------------------------------- */

/**
 * Sanitized user returned by `POST /v1/admin/users` and `GET /v1/auth/profile`.
 * Mirrors [`user.UserResponse`](../../../internal/user/user.go).
 */
interface UserResponse {
  id: string;
  phone: string;
  role: string;
  first_name: string;
  last_name: string;
  national_code: string;
}

/**
 * Doctor profile returned by the clinic endpoints. The denormalized
 * user-identity fields are populated server-side (via the bootstrap
 * UserReader adapter) so listings are self-contained.
 * Mirrors [`clinic.DoctorProfileResponse`](../../../internal/clinic/clinic.go).
 */
interface DoctorProfileResponse {
  id: string;
  user_id: string;
  specialty: string;
  medical_system_number: string;
  visit_duration_minutes: number;
  visit_fee: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  national_code?: string;
  patient_count?: number;
  receptionist_count?: number;
}

/**
 * Normalizes a backend profile response (optionally combined with its user
 * response) into the admin-facing {@link AdminDoctor} shape.
 *
 * The backend does not model `email` or `status`, so those default to safe
 * values (no email, ACTIVE) — the admin table simply shows what the
 * persistence layer actually tracks.
 */
function toAdminDoctor(
  p: DoctorProfileResponse,
  u?: UserResponse,
): AdminDoctor {
  return {
    id: p.id,
    user_id: p.user_id,
    first_name: p.first_name ?? u?.first_name ?? "",
    last_name: p.last_name ?? u?.last_name ?? "",
    phone: p.phone ?? u?.phone ?? "",
    email: undefined,
    specialty: p.specialty,
    medical_system_number: p.medical_system_number,
    visit_duration_minutes: p.visit_duration_minutes,
    visit_fee: p.visit_fee ?? 0,
    status: "ACTIVE",
    is_active: true,
    patient_count: p.patient_count ?? 0,
    receptionist_count: p.receptionist_count ?? 0,
  };
}

/* -------------------------------------------------------------------------- */
/*  Doctors                                                                   */
/* -------------------------------------------------------------------------- */

/** Fetch the admin doctor list, optionally filtered. */
export async function fetchAdminDoctors(
  filters?: AdminDoctorFilters,
): Promise<AdminDoctor[]> {
  if (USE_ADMIN_DOCTOR_MOCK) {
    await delay(350);
    return DOCTORS.filter((d) => matches(d, filters));
  }

  const res = await apiClient.get<DoctorProfileResponse[]>(
    "/v1/clinics/doctors",
  );
  const doctors = res.data.map((p) => toAdminDoctor(p));
  // NOTE: filtering is client-side because the backend list endpoint does not
  // accept query filters yet. The data set is small (admin staff list), so this
  // is acceptable until server-side filtering is added.
  return doctors.filter((d) => matches(d, filters));
}

/** Fetch a single admin doctor by profile id. */
export async function fetchAdminDoctor(id: string): Promise<AdminDoctor> {
  if (USE_ADMIN_DOCTOR_MOCK) {
    await delay(250);
    const doc = DOCTORS.find((d) => d.id === id);
    if (!doc) throw new Error(`Doctor ${id} not found`);
    return doc;
  }

  const res = await apiClient.get<DoctorProfileResponse>(
    `/v1/clinics/doctors/${id}`,
  );
  return toAdminDoctor(res.data);
}

/** Create a new doctor (user account + profile). */
export async function createDoctor(
  req: CreateDoctorRequest,
): Promise<AdminDoctor> {
  if (USE_ADMIN_DOCTOR_MOCK) {
    await delay(450);
    const profileId = nextId("doc-profile");
    const userId = nextId("user");
    const created: AdminDoctor = {
      id: profileId,
      user_id: userId,
      first_name: req.first_name,
      last_name: req.last_name,
      phone: req.phone,
      email: req.email,
      specialty: req.specialty,
      medical_system_number: req.medical_system_number,
      visit_duration_minutes: req.visit_duration_minutes,
      visit_fee: req.visit_fee,
      status: req.status,
      is_active: req.status === "ACTIVE",
      patient_count: 0,
      receptionist_count: 0,
    };
    DOCTORS.push(created);
    SHIFTS[profileId] = [];
    return created;
  }

  // The backend models a doctor as two separate resources: a DOCTOR user
  // account (POST /v1/admin/users) and a doctor profile linked to it
  // (POST /v1/clinics/doctors). We create the user first, then the profile,
  // and merge both responses into the admin-facing AdminDoctor shape.
  //
  // Step 1: mint the DOCTOR user account.
  const userRes = await apiClient.post<UserResponse>("/v1/admin/users", {
    phone: req.phone,
    // Staff authenticate by username + password (patients use OTP), so the
    // minted DOCTOR account needs a login username.
    username: req.username,
    password: req.password,
    role: "DOCTOR",
    first_name: req.first_name,
    last_name: req.last_name,
    national_code: req.national_code,
  });
  const user = userRes.data;

  // Step 2: create the professional profile referencing the new user.
  const profileRes = await apiClient.post<DoctorProfileResponse>(
    "/v1/clinics/doctors",
    {
      user_id: user.id,
      specialty: req.specialty,
      medical_system_number: req.medical_system_number,
      visit_duration_minutes: req.visit_duration_minutes,
      visit_fee: req.visit_fee,
    },
  );

  return toAdminDoctor(profileRes.data, user);
}

/** Update an existing doctor. */
export async function updateDoctor(
  id: string,
  req: UpdateDoctorRequest,
): Promise<AdminDoctor> {
  if (USE_ADMIN_DOCTOR_MOCK) {
    await delay(400);
    const idx = DOCTORS.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error(`Doctor ${id} not found`);
    const updated: AdminDoctor = {
      ...DOCTORS[idx],
      first_name: req.first_name,
      last_name: req.last_name,
      phone: req.phone,
      email: req.email,
      specialty: req.specialty,
      medical_system_number: req.medical_system_number,
      visit_duration_minutes: req.visit_duration_minutes,
      status: req.status,
      is_active: req.status === "ACTIVE",
    };
    DOCTORS[idx] = updated;
    return updated;
  }

  // The backend's UpdateDoctorProfileRequest only accepts the professional
  // fields; identity fields (name/phone) are not editable through this endpoint
  // (no admin user-update endpoint exists yet), so we send only what it accepts.
  const res = await apiClient.put<DoctorProfileResponse>(
    `/v1/clinics/doctors/${id}`,
    {
      specialty: req.specialty,
      medical_system_number: req.medical_system_number,
      visit_duration_minutes: req.visit_duration_minutes,
      visit_fee: req.visit_fee,
    },
  );
  return toAdminDoctor(res.data);
}

/** Delete a doctor (and their weekly shifts). */
export async function deleteDoctor(id: string): Promise<void> {
  if (USE_ADMIN_DOCTOR_MOCK) {
    await delay(300);
    const idx = DOCTORS.findIndex((d) => d.id === id);
    if (idx !== -1) DOCTORS.splice(idx, 1);
    delete SHIFTS[id];
    return;
  }

  await apiClient.delete(`/v1/clinics/doctors/${id}`);
}

/* -------------------------------------------------------------------------- */
/*  Weekly shifts                                                             */
/* -------------------------------------------------------------------------- */

/** Fetch the weekly shifts for a doctor. */
export async function fetchDoctorShifts(
  doctorId: string,
): Promise<WeeklyShift[]> {
  if (USE_ADMIN_SHIFT_MOCK) {
    await delay(300);
    return SHIFTS[doctorId] ?? [];
  }

  const res = await apiClient.get<WeeklyShift[]>(
    `/v1/schedule/doctors/${doctorId}/shifts`,
  );
  return res.data;
}

/** Create or update a weekly shift for a doctor. */
export async function upsertDoctorShift(
  doctorId: string,
  req: UpsertShiftRequest,
): Promise<WeeklyShift> {
  if (USE_ADMIN_SHIFT_MOCK) {
    await delay(350);
    const list = SHIFTS[doctorId] ?? (SHIFTS[doctorId] = []);
    // Treat day_of_week as the uniqueness key — replace if present.
    const existingIdx = list.findIndex((s) => s.day_of_week === req.day_of_week);
    if (existingIdx !== -1) {
      const updated: WeeklyShift = {
        ...list[existingIdx],
        ...req,
      };
      list[existingIdx] = updated;
      return updated;
    }
    const created: WeeklyShift = {
      id: nextId("shift"),
      doctor_id: doctorId,
      ...req,
      is_active: true,
    };
    list.push(created);
    return created;
  }

  const res = await apiClient.post<WeeklyShift>(
    `/v1/schedule/doctors/${doctorId}/shifts`,
    req,
  );
  return res.data;
}

/** Remove a weekly shift from a doctor. */
export async function deleteDoctorShift(
  doctorId: string,
  shiftId: string,
): Promise<void> {
  if (USE_ADMIN_SHIFT_MOCK) {
    await delay(250);
    const list = SHIFTS[doctorId];
    if (list) {
      const idx = list.findIndex((s) => s.id === shiftId);
      if (idx !== -1) list.splice(idx, 1);
    }
    return;
  }

  await apiClient.delete(
    `/v1/schedule/doctors/${doctorId}/shifts/${shiftId}`,
  );
}
