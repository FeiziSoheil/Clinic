/**
 * Mock data for the Patient Discovery & Booking flow.
 *
 * The backend does not yet expose patient-accessible doctor listing, shift or
 * time-slot endpoints (and has no `visit_fee`). Until those land, read
 * operations in [`doctor-api.ts`](src/lib/doctor-api.ts) resolve against the
 * fixtures below with a simulated network delay.
 *
 * Time-slot / shift generation is deterministic: availability is derived from
 * a pseudo-random hash of the slot index so the UI is stable across
 * re-renders and there is no flickering.
 */

import type { Doctor, Shift, TimeSlot } from "@/types/doctor";

/** Canonical list of specialties surfaced in the discovery filter. */
export const MOCK_SPECIALTIES: string[] = [
  "Cardiology",
  "Dermatology",
  "Neurology",
  "Pediatrics",
  "Orthopedics",
  "General Medicine",
  "Psychiatry",
  "Ophthalmology",
];

/** Eight realistic Persian-international doctors across varied specialties. */
export const MOCK_DOCTORS: Doctor[] = [
  {
    id: "doc-1001",
    user_id: "usr-2001",
    first_name: "Arman",
    last_name: "Khorrami",
    full_name: "Dr. Arman Khorrami",
    specialty: "Cardiology",
    medical_system_number: "47821",
    visit_duration_minutes: 30,
    visit_fee: 450000,
    avatar_url: undefined,
    rating: 4.8,
    bio: "Interventional cardiologist with 12 years of experience treating arrhythmias and coronary disease.",
  },
  {
    id: "doc-1002",
    user_id: "usr-2002",
    first_name: "Shirin",
    last_name: "Etemadi",
    full_name: "Dr. Shirin Etemadi",
    specialty: "Dermatology",
    medical_system_number: "51209",
    visit_duration_minutes: 15,
    visit_fee: 300000,
    rating: 4.6,
    bio: "Board-certified dermatologist focused on acne, eczema and cosmetic skin care.",
  },
  {
    id: "doc-1003",
    user_id: "usr-2003",
    first_name: "Babak",
    last_name: "Rafiei",
    full_name: "Dr. Babak Rafiei",
    specialty: "Neurology",
    medical_system_number: "49873",
    visit_duration_minutes: 30,
    visit_fee: 500000,
    rating: 4.9,
    bio: "Neurologist specializing in migraine, epilepsy and movement disorders.",
  },
  {
    id: "doc-1004",
    user_id: "usr-2004",
    first_name: "Niloofar",
    last_name: "Sanaei",
    full_name: "Dr. Niloofar Sanaei",
    specialty: "Pediatrics",
    medical_system_number: "53441",
    visit_duration_minutes: 15,
    visit_fee: 250000,
    rating: 4.7,
    bio: "Pediatrician with a gentle approach to newborn and child wellness checks.",
  },
  {
    id: "doc-1005",
    user_id: "usr-2005",
    first_name: "Kasra",
    last_name: "Movahed",
    full_name: "Dr. Kasra Movahed",
    specialty: "Orthopedics",
    medical_system_number: "46110",
    visit_duration_minutes: 30,
    visit_fee: 400000,
    rating: 4.5,
    bio: "Orthopedic surgeon treating sports injuries, joint pain and fractures.",
  },
  {
    id: "doc-1006",
    user_id: "usr-2006",
    first_name: "Mitra",
    last_name: "Hashemi",
    full_name: "Dr. Mitra Hashemi",
    specialty: "General Medicine",
    medical_system_number: "39055",
    visit_duration_minutes: 15,
    visit_fee: 150000,
    rating: 4.4,
    bio: "Family physician providing preventive care and chronic disease management.",
  },
  {
    id: "doc-1007",
    user_id: "usr-2007",
    first_name: "Sina",
    last_name: "Tehrani",
    full_name: "Dr. Sina Tehrani",
    specialty: "Psychiatry",
    medical_system_number: "50228",
    visit_duration_minutes: 30,
    visit_fee: 480000,
    rating: 4.9,
    bio: "Psychiatrist focused on anxiety, depression and adult ADHD.",
  },
  {
    id: "doc-1008",
    user_id: "usr-2008",
    first_name: "Roxana",
    last_name: "Karimi",
    full_name: "Dr. Roxana Karimi",
    specialty: "Ophthalmology",
    medical_system_number: "47790",
    visit_duration_minutes: 15,
    visit_fee: 350000,
    rating: 4.6,
    bio: "Ophthalmologist offering routine eye exams, cataract and refractive consults.",
  },
];

/* -------------------------------------------------------------------------- */
/*  Shift & time-slot generation                                              */
/* -------------------------------------------------------------------------- */

/** Number of upcoming days to generate shifts for. */
const SHIFT_HORIZON_DAYS = 14;

/**
 * Build a deterministic `"YYYY-MM-DD"` date string `daysFromNow` ahead of
 * today (local time), so the same shift calendar is produced within a day.
 */
function datePlusDays(daysFromNow: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + daysFromNow);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** `getDay()`: 0=Sun … 6=Sat. Friday is 5. */
const FRIDAY = 5;

/**
 * Generate working shifts for a doctor over the next
 * {@link SHIFT_HORIZON_DAYS} days.
 *
 * Fridays are skipped (weekend). Shift windows are chosen deterministically
 * based on the doctor id + day offset so the calendar is stable per session.
 */
export function generateMockShifts(doctorId: string): Shift[] {
  const shifts: Shift[] = [];

  for (let offset = 0; offset < SHIFT_HORIZON_DAYS; offset++) {
    const probe = new Date();
    probe.setDate(probe.getDate() + offset);

    // Skip Fridays (Iranian weekend).
    if (probe.getDay() === FRIDAY) continue;

    // Deterministically pick a shift pattern for the day.
    const seed = hashString(`${doctorId}:${offset}`);
    // ~15% of days off, even for working doctors.
    const dayOff = seed % 100 < 15;
    if (dayOff) continue;

    const isMorning = seed % 2 === 0;
    const start_time = isMorning ? "08:00" : "16:00";
    const end_time = isMorning ? "13:00" : "20:00";
    const max_patients = 10 + (seed % 11); // 10–20

    shifts.push({
      id: `shift-${doctorId}-${datePlusDays(offset)}`,
      doctor_id: doctorId,
      date: datePlusDays(offset),
      start_time,
      end_time,
      max_patients,
      is_active: true,
    });
  }

  return shifts;
}

/**
 * Slice a shift's `[start_time, end_time)` window into visit-length slots.
 *
 * Availability is deterministic: a slot is available when
 * `hash(slotIndex) % 100 < 60`, giving a stable ~60% availability that does
 * not flicker between renders.
 *
 * `booked_count` is derived deterministically too, so a slot showing N/X
 * patients stays consistent.
 */
export function generateTimeSlots(
  shift: Shift,
  visitDurationMinutes: number,
): TimeSlot[] {
  const slots: TimeSlot[] = [];
  const startMin = toMinutes(shift.start_time);
  const endMin = toMinutes(shift.end_time);

  for (
    let cursor = startMin, index = 0;
    cursor + visitDurationMinutes <= endMin;
    cursor += visitDurationMinutes, index++
  ) {
    const seed = hashString(`${shift.id}:${index}`);
    const available = seed % 100 < 60;
    const max_patients = Math.max(1, Math.floor(shift.max_patients / 8));
    // Deterministic booked count within [0, max_patients].
    const booked_count = available ? seed % (max_patients + 1) : max_patients;

    slots.push({
      start_time: toHHmm(cursor),
      end_time: toHHmm(cursor + visitDurationMinutes),
      available,
      booked_count,
      max_patients,
    });
  }

  return slots;
}

/* -------------------------------------------------------------------------- */
/*  Internal helpers                                                          */
/* -------------------------------------------------------------------------- */

/** FNV-1a-ish deterministic string hash → 32-bit unsigned int. */
export function hashString(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // Math.imul keeps the multiply in 32-bit space.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Convert `"HH:mm"` to minutes since midnight. */
function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Convert minutes since midnight back to `"HH:mm"`. */
function toHHmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}
