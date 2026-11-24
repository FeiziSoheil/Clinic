/**
 * Doctor-domain types.
 *
 * These shapes describe the *ideal* frontend contract. Several of these
 * fields (e.g. `visit_fee`, `avatar_url`, `rating`) are not yet exposed by a
 * patient-accessible backend endpoint, so read operations currently rely on
 * mock data. Once the backend is ready, the mock layer in
 * [`doctor-api.ts`](src/lib/doctor-api.ts) can be toggled off via the
 * `USE_MOCK` flag without changing consuming components.
 */

/** A doctor profile as surfaced to patients for discovery & booking. */
export interface Doctor {
  /** Doctor profile ID (NOT the auth user id). */
  id: string;
  /** Underlying auth user id of the doctor. */
  user_id: string;
  first_name: string;
  last_name: string;
  /** Computed display name, e.g. `"Dr. First Last"`. */
  full_name: string;
  specialty: string;
  /** Iranian medical system registration number. */
  medical_system_number: string;
  /** Length of a single visit in minutes (e.g. 15 or 30). */
  visit_duration_minutes: number;
  /** Visit fee in the smallest displayed currency unit (Toman). */
  visit_fee: number;
  avatar_url?: string;
  /** Average patient rating, 0–5. */
  rating?: number;
  bio?: string;
}

/** A scheduled working window for a doctor on a given day. */
export interface Shift {
  id: string;
  doctor_id: string;
  /** ISO date, `"YYYY-MM-DD"`. */
  date: string;
  /** Start of the shift, `"HH:mm"`. */
  start_time: string;
  /** End of the shift, `"HH:mm"`. */
  end_time: string;
  /** Maximum concurrent/total patients the shift can hold. */
  max_patients: number;
  is_active: boolean;
}

/**
 * A bookable sub-window of a [`Shift`](.) of length
 * `visit_duration_minutes`.
 */
export interface TimeSlot {
  /** Slot start, `"HH:mm"`. */
  start_time: string;
  /** Slot end, `"HH:mm"`. */
  end_time: string;
  /** Whether the slot still accepts new bookings. */
  available: boolean;
  /** How many patients are already booked into the slot (mock only). */
  booked_count?: number;
  /** Capacity of the slot. */
  max_patients: number;
}

/** Optional filter object accepted by [`fetchDoctors`](src/lib/doctor-api.ts). */
export interface DoctorFilters {
  specialty?: string;
  search?: string;
}
