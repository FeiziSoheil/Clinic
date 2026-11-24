/**
 * Schedule leave types.
 *
 * Maps the Go [`Leave`](../../../internal/schedule/schedule.go) entity and its
 * request/response DTOs to TypeScript. Field names keep snake_case JSON keys to
 * match the backend DTOs verbatim (no camelCase transform), per the frontend
 * conventions.
 *
 * The backend `Leave` models a single day off (`date` + `reason`). The admin UI
 * projects it into a richer {@link Leave} shape with a date range and a status
 * for display; the API layer normalizes between the two representations.
 */

/** Lifecycle status of a leave request (admin-side display projection). */
export type LeaveStatus = "pending" | "approved" | "rejected";

/**
 * Admin-facing leave record.
 *
 * Mirrors [`schedule.Leave`](../../../internal/schedule/schedule.go). The
 * backend tracks a single `date`; the admin UI treats that as the `start_date`
 * (and aliases it as `end_date` for a range-less display). `doctor_name` and
 * `status` are denormalized/projection fields for table display — they are not
 * persisted by the backend.
 */
export interface Leave {
  /** MongoDB primary key. */
  id: string;
  /** Hex id of the doctor user the leave belongs to. */
  doctor_id: string;
  /** Denormalized doctor display name (resolved client-side for the table). */
  doctor_name?: string;
  /** Inclusive start of the leave (ISO date string `YYYY-MM-DD`). */
  start_date: string;
  /** Inclusive end of the leave (ISO date string `YYYY-MM-DD`). */
  end_date: string;
  /** Free-text justification for the leave. */
  reason?: string;
  /** Lifecycle status badge. */
  status: LeaveStatus;
  /** Timestamp the leave record was first persisted (ISO string). */
  created_at?: string;
}

/**
 * Payload to create a leave.
 *
 * Maps to [`schedule.CreateLeaveRequest`](../../../internal/schedule/schedule.go)
 * — the backend only accepts a single `date`, so the API layer sends
 * `start_date` as that `date`.
 */
export interface LeaveRequest {
  doctor_id: string;
  start_date: string;
  end_date: string;
  reason?: string;
}

/** Sanitized view of a leave returned by read endpoints. */
export type LeaveResponse = Leave;

/** Convenience alias for a list of leaves. */
export type LeaveListResponse = Leave[];

/* -------------------------------------------------------------------------- */
/*  Shifts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * A doctor's working shift.
 *
 * Mirrors the backend shift response serialized from a Go document holding
 * `primitive.ObjectID` fields (all ids are treated as hex strings on the
 * client). The backend stores `date`/`start_time`/`end_time` as Go `time.Time`
 * (ISO 8601); the API layer normalizes them into stable display strings.
 */
export interface Shift {
  /** MongoDB primary key (hex string). */
  id: string;
  /** Hex id of the doctor the shift belongs to. */
  doctor_id: string;
  /** Calendar date of the shift (`"YYYY-MM-DD"`). */
  date: string;
  /** Start time as an ISO string (`"HH:mm"` after API normalization). */
  start_time: string;
  /** End time as an ISO string (`"HH:mm"` after API normalization). */
  end_time: string;
  /** Max patients bookable into this shift. */
  max_patients: number;
  /** Whether the shift is currently active. */
  is_active?: boolean;
}

/**
 * Payload to create a single shift.
 *
 * `date`/`start_time`/`end_time` are combined into ISO datetime strings before
 * being sent to the backend.
 */
export interface ShiftRequest {
  doctor_id: string;
  /** `"YYYY-MM-DD"`. */
  date: string;
  /** `"HH:mm"`. */
  start_time: string;
  /** `"HH:mm"`. */
  end_time: string;
  max_patients: number;
}

/**
 * Payload to create a recurring set of shifts.
 *
 * Generates one shift per matching weekday inside the `[from_date, to_date]`
 * window.
 */
export interface RecurringShiftRequest {
  doctor_id: string;
  /**
   * Day names matching {@link WEEKDAY_OPTIONS} in `ShiftFormDialog`, e.g.
   * `["SATURDAY", "SUNDAY"]`. The API layer maps these to the numeric
   * `time.Weekday` encoding (0=Sunday..6=Saturday) the backend expects.
   */
  weekdays: string[];
  start_time: string;
  end_time: string;
  max_patients: number;
  /** `"YYYY-MM-DD"`. */
  from_date: string;
  /** `"YYYY-MM-DD"`. */
  to_date: string;
}

/* -------------------------------------------------------------------------- */
/*  Time blocks                                                               */
/* -------------------------------------------------------------------------- */

/**
 * A blocked-off chunk of a doctor's calendar (unavailable time).
 *
 * Mirrors the backend time-block response. `date`/`start_time`/`end_time` are
 * stored as display strings (`"YYYY-MM-DD"` and `"HH:mm"`) so the UI can render
 * them without further parsing.
 */
export interface TimeBlock {
  /** MongoDB primary key (hex string). */
  id: string;
  /** Hex id of the doctor the block belongs to. */
  doctor_id: string;
  /** Calendar date of the block (`"YYYY-MM-DD"`). */
  date: string;
  /** Start time of the block (`"HH:mm"`). */
  start_time: string;
  /** End time of the block (`"HH:mm"`). */
  end_time: string;
  /** Free-text reason for the block (meeting, surgery, break, …). */
  reason: string;
  /** ISO 8601 timestamp the block was created. */
  created_at: string;
}

/**
 * Payload to create a time block.
 *
 * Maps to `POST /v1/schedule/time-blocks`.
 */
export interface CreateTimeBlockRequest {
  doctor_id: string;
  /** `"YYYY-MM-DD"`. */
  date: string;
  /** `"HH:mm"`. */
  start_time: string;
  /** `"HH:mm"`. */
  end_time: string;
  reason?: string;
}
