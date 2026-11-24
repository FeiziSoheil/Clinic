/**
 * Doctor shift CRUD operations against the live schedule backend.
 *
 * Mirrors the JSDoc style of [`schedule-api.ts`](src/lib/schedule-api.ts). All
 * requests hit the real endpoints mounted at `/v1/schedule/shifts` (RoleAuth
 * ADMIN+DOCTOR) — there is no mock layer.
 *
 * Endpoints:
 *  - `GET    /v1/schedule/shifts`           list shifts (`?doctor_id=&date=`)
 *  - `POST   /v1/schedule/shifts`           create a single shift
 *  - `POST   /v1/schedule/shifts/recurring` create shifts for a weekday range
 *  - `DELETE /v1/schedule/shifts/:id`       delete a shift
 *
 * NOTE: the backend `date`/`start_time`/`end_time` are Go `time.Time` (ISO 8601).
 * When creating, a `"YYYY-MM-DD"` date + `"HH:mm"` time are combined into a full
 * ISO datetime string. The list response returns `primitive.ObjectID` fields
 * serialized as hex strings.
 */

import { apiClient } from "./api";
import type {
  RecurringShiftRequest,
  Shift,
  ShiftRequest,
} from "@/types/schedule";

/** Raw backend shift payload (ids are ObjectIDs serialized as strings). */
interface ShiftBackendResponse {
  id: string;
  doctor_id: string;
  date?: string;
  start_time?: string;
  end_time?: string;
  max_patients?: number;
  is_active?: boolean;
}

/**
 * Combine a `"YYYY-MM-DD"` date with a `"HH:mm"` time into an ISO 8601 datetime
 * in Asia/Tehran (IRST, UTC+03:30, no DST). Matches how public slots are
 * rendered and how booking eligibility compares absolute instants.
 */
function toISO(date: string, time: string): string {
  const hhmm = time.length === 5 ? `${time}:00` : time;
  return `${date}T${hhmm}+03:30`;
}

/**
 * Map Go `time.Weekday` day names to their numeric encoding (0=Sunday..6=Saturday),
 * matching `schedule.CreateRecurringShiftRequest.Weekdays []int` on the backend.
 */
const WEEKDAY_TO_INT: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/** Extract the Tehran calendar day `"YYYY-MM-DD"` from an absolute ISO instant. */
function datePart(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso.split("T")[0]?.slice(0, 10) ?? iso.slice(0, 10);
  }
}

/** Extract the Tehran wall-clock `"HH:mm"` from an absolute ISO instant. */
function timePart(iso: string | undefined): string {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Tehran",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    const timeSeg = iso.split("T")[1];
    if (!timeSeg) return "";
    return timeSeg.slice(0, 5);
  }
}

/**
 * Normalize a backend shift response into the client {@link Shift} shape.
 *
 * Go/Mongo return absolute UTC instants; calendar day and wall-clock times are
 * rendered in Asia/Tehran so they match what the create form sends (`+03:30`).
 * Deriving the day from `start_time` (not the stored `date` midnight) avoids
 * off-by-one when midnight was normalized in a different location.
 */
function toShift(s: ShiftBackendResponse): Shift {
  const startIso = s.start_time ?? s.date ?? "";
  return {
    id: s.id,
    doctor_id: s.doctor_id,
    date: datePart(startIso),
    start_time: timePart(s.start_time),
    end_time: timePart(s.end_time),
    max_patients: s.max_patients ?? 0,
    is_active: s.is_active,
  };
}

/**
 * Fetch the shifts belonging to a doctor, optionally narrowed to a date.
 *
 * @param doctorId Hex id of the signed-in doctor.
 * @param date     Optional `"YYYY-MM-DD"` filter.
 */
export async function listMyShifts(
  doctorId: string,
  date?: string,
): Promise<Shift[]> {
  const params: Record<string, string> = { doctor_id: doctorId };
  if (date) params.date = date;

  const res = await apiClient.get<ShiftBackendResponse[]>(
    "/v1/schedule/shifts",
    { params },
  );
  return res.data.map(toShift);
}

/**
 * Create a single shift for a doctor.
 *
 * Combines the date + time fields into ISO datetimes before sending.
 */
export async function createShift(req: ShiftRequest): Promise<Shift> {
  const payload = {
    doctor_id: req.doctor_id,
    date: toISO(req.date, req.start_time),
    start_time: toISO(req.date, req.start_time),
    end_time: toISO(req.date, req.end_time),
    max_patients: req.max_patients,
  };
  const res = await apiClient.post<ShiftBackendResponse>(
    "/v1/schedule/shifts",
    payload,
  );
  return toShift(res.data);
}

/**
 * Create a recurring set of shifts for the given weekdays inside a date window.
 */
export async function createRecurringShifts(
  req: RecurringShiftRequest,
): Promise<Shift[]> {
  const payload = {
    doctor_id: req.doctor_id,
    weekdays: req.weekdays.map((day) => WEEKDAY_TO_INT[day]),
    start_time: toISO(req.from_date, req.start_time),
    end_time: toISO(req.from_date, req.end_time),
    max_patients: req.max_patients,
    from_date: toISO(req.from_date, "00:00"),
    to_date: toISO(req.to_date, "00:00"),
  };
  const res = await apiClient.post<ShiftBackendResponse[]>(
    "/v1/schedule/shifts/recurring",
    payload,
  );
  return res.data.map(toShift);
}

/** Delete a shift by id. */
export async function deleteShift(id: string): Promise<void> {
  await apiClient.delete(`/v1/schedule/shifts/${id}`);
}

/**
 * Update a shift's mutable fields (toggle active status / adjust capacity).
 *
 * Real endpoint: `PUT /v1/schedule/shifts/:id`.
 *
 * @param shiftId Hex id of the shift to update.
 * @param data    Partial update — `is_active` and/or `max_patients`.
 */
export async function updateShift(
  shiftId: string,
  data: { is_active?: boolean; max_patients?: number },
): Promise<Shift> {
  const res = await apiClient.put<ShiftBackendResponse>(
    `/v1/schedule/shifts/${shiftId}`,
    data,
  );
  return toShift(res.data);
}
