/**
 * Doctor read operations (patient discovery + booking).
 *
 * These functions hit the REAL backend public endpoints exposed by the clinic
 * & schedule domains (see `cmd/clinic-api/bootstrap/routes.go`):
 *  - `GET /v1/doctors`                 list doctors (public)
 *  - `GET /v1/doctors/:id`             fetch one doctor (public)
 *  - `GET /v1/doctors/:id/shifts`      a doctor's shifts (?date=YYYY-MM-DD)
 *  - `GET /v1/doctors/:id/slots`       bookable slots (?date=&visit_duration=)
 *
 * A `USE_MOCK` flag is retained for offline development / demos; it defaults to
 * `false` so the app runs against the real database. Consuming components are
 * unchanged because the return types ([`Doctor`](src/types/doctor.ts),
 * [`Shift`](src/types/doctor.ts), [`TimeSlot`](src/types/doctor.ts)) are stable.
 */

import { apiClient } from "./api";
import {
  MOCK_DOCTORS,
  MOCK_SPECIALTIES,
  generateMockShifts,
  generateTimeSlots,
} from "./mock-data";
import type { Doctor, DoctorFilters, Shift, TimeSlot } from "@/types/doctor";

/**
 * Master switch for the mock layer. `false` (default) hits the real backend.
 */
export const USE_MOCK = false;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/*  Backend response shapes + mapping                                         */
/* -------------------------------------------------------------------------- */

/**
 * Doctor profile returned by the public `/v1/doctors` endpoints. Mirrors
 * [`clinic.DoctorProfileResponse`](../../../internal/clinic/clinic.go); the
 * user-identity fields are denormalized server-side.
 */
interface DoctorProfileResponse {
  id: string;
  user_id: string;
  specialty: string;
  medical_system_number: string;
  visit_duration_minutes: number;
  visit_fee?: number;
  first_name?: string;
  last_name?: string;
  phone?: string;
  national_code?: string;
}

/**
 * Shift returned by the public `/v1/doctors/:id/shifts` endpoint. `date`,
 * `start_time` and `end_time` are RFC3339 timestamps; the mapper below extracts
 * the wall-clock pieces the UI needs. Mirrors
 * [`schedule.ShiftResponse`](../../../internal/schedule/schedule.go).
 */
interface ShiftResponse {
  id: string;
  doctor_id: string;
  date: string;
  start_time: string;
  end_time: string;
  max_patients: number;
  is_active: boolean;
}

/** Build the patient-facing display name, e.g. `"Dr. Sara Ahmadi"`. */
function buildFullName(first: string, last: string): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  return `Dr. ${f} ${l}`.replace(/\s+/g, " ").trim();
}

/** Map a backend profile into the patient-facing [`Doctor`] shape. */
function toDoctor(p: DoctorProfileResponse): Doctor {
  const firstName = p.first_name ?? "";
  const lastName = p.last_name ?? "";
  return {
    id: p.id,
    user_id: p.user_id,
    first_name: firstName,
    last_name: lastName,
    full_name: buildFullName(firstName, lastName),
    specialty: p.specialty,
    medical_system_number: p.medical_system_number,
    visit_duration_minutes: p.visit_duration_minutes,
    visit_fee: p.visit_fee ?? 0,
    avatar_url: undefined,
    rating: undefined,
    bio: undefined,
  };
}

/** Format an ISO timestamp as Tehran wall-clock "HH:mm" (24h). */
function toTehranTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

/** Format an ISO timestamp as the Tehran calendar day "YYYY-MM-DD". */
function toTehranDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

/** Map a backend shift response into the frontend [`Shift`] shape. */
function toShift(s: ShiftResponse): Shift {
  return {
    id: s.id,
    doctor_id: s.doctor_id,
    // Calendar day and wall-clock times are derived from the shift's start/end
    // (absolute UTC instants) and rendered in Tehran local time, since the Go
    // Mongo driver stores/returns times normalized to UTC.
    date: toTehranDate(s.start_time),
    start_time: toTehranTime(s.start_time),
    end_time: toTehranTime(s.end_time),
    max_patients: s.max_patients,
    is_active: s.is_active,
  };
}

/* -------------------------------------------------------------------------- */
/*  Doctors                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Fetch the list of doctors, optionally filtered by specialty and/or a free
 * text search. Real endpoint: `GET /v1/doctors`.
 */
export async function fetchDoctors(
  filters?: DoctorFilters,
): Promise<Doctor[]> {
  if (USE_MOCK) {
    await delay(400);
    let result = MOCK_DOCTORS;
    if (filters?.specialty) {
      result = result.filter((d) => d.specialty === filters.specialty);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      result = result.filter(
        (d) =>
          d.full_name.toLowerCase().includes(q) ||
          d.specialty.toLowerCase().includes(q),
      );
    }
    return result;
  }

  const res = await apiClient.get<DoctorProfileResponse[]>("/v1/doctors");
  let doctors = res.data.map(toDoctor);
  // The public list endpoint does not accept query filters, so filtering is
  // applied client-side. The doctor directory is small, so this is fine.
  if (filters?.specialty) {
    doctors = doctors.filter((d) => d.specialty === filters.specialty);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    doctors = doctors.filter(
      (d) =>
        d.full_name.toLowerCase().includes(q) ||
        d.specialty.toLowerCase().includes(q),
    );
  }
  return doctors;
}

/** Fetch a single doctor by profile id. Real endpoint: `GET /v1/doctors/:id`. */
export async function fetchDoctorById(id: string): Promise<Doctor> {
  if (USE_MOCK) {
    await delay(300);
    const doctor = MOCK_DOCTORS.find((d) => d.id === id);
    if (!doctor) {
      throw new Error(`Doctor ${id} not found`);
    }
    return doctor;
  }

  const res = await apiClient.get<DoctorProfileResponse>(`/v1/doctors/${id}`);
  return toDoctor(res.data);
}

/** Fetch shifts for a doctor. Real endpoint: `GET /v1/doctors/:id/shifts`. */
export async function fetchDoctorShifts(doctorId: string): Promise<Shift[]> {
  if (USE_MOCK) {
    await delay(350);
    return generateMockShifts(doctorId);
  }

  const res = await apiClient.get<ShiftResponse[]>(
    `/v1/doctors/${doctorId}/shifts`,
  );
  return res.data.map(toShift);
}

/**
 * Fetch bookable time slots for a doctor on a given date.
 * Real endpoint: `GET /v1/doctors/:id/slots?date=YYYY-MM-DD&visit_duration=N`.
 */
export async function fetchTimeSlots(
  doctorId: string,
  date: string,
  visitDurationMinutes: number,
): Promise<TimeSlot[]> {
  if (USE_MOCK) {
    await delay(300);
    const shifts = generateMockShifts(doctorId);
    const shift = shifts.find((s) => s.date === date);
    if (!shift) return [];
    return generateTimeSlots(shift, visitDurationMinutes);
  }

  const res = await apiClient.get<TimeSlot[]>(
    `/v1/doctors/${doctorId}/slots`,
    { params: { date, visit_duration: visitDurationMinutes } },
  );
  return res.data;
}

/**
 * Fetch the canonical specialty list for the discovery filter.
 *
 * There is no dedicated specialties endpoint, so this derives the list from the
 * real doctor directory (unique specialties). This keeps it free of any hard-
 * coded/fake data while remaining correct as doctors are added/removed.
 */
export async function fetchSpecialties(): Promise<string[]> {
  if (USE_MOCK) {
    await delay(150);
    return MOCK_SPECIALTIES;
  }

  const res = await apiClient.get<DoctorProfileResponse[]>("/v1/doctors");
  const specialties = new Set<string>();
  for (const d of res.data) {
    if (d.specialty) specialties.add(d.specialty);
  }
  return Array.from(specialties).sort((a, b) => a.localeCompare(b));
}
