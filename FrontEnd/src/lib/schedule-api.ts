/**
 * Schedule leave CRUD operations.
 *
 * Mirrors the `USE_MOCK` + `delay()` pattern of
 * [`admin-doctor-api.ts`](src/lib/admin-doctor-api.ts). The backend leave
 * endpoints already exist (`/v1/schedule/leaves`), so {@link USE_LEAVE_MOCK}
 * defaults to `false`; the mock branch is kept as a fallback so the screens are
 * fully explorable without a running backend.
 *
 * Endpoints:
 *  - `GET    /v1/schedule/leaves`        list leaves (optional `doctor_id`)
 *  - `GET    /v1/schedule/leaves/:id`    fetch one leave
 *  - `POST   /v1/schedule/leaves`        create leave
 *  - `DELETE /v1/schedule/leaves/:id`    delete leave
 */

import { apiClient } from "./api";
import type {
  CreateTimeBlockRequest,
  Leave,
  LeaveRequest,
  TimeBlock,
} from "@/types/schedule";

/**
 * Master switch for the leave mock layer.
 *
 * `false` (default): leave list/create/delete hit the real backend
 *   (`/v1/schedule/leaves`). Flip to `true` to resolve against in-memory
 *   fixtures instead.
 */
export const USE_LEAVE_MOCK = false;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Monotonic counter for generating stable-ish ids in the mock layer. */
let leaveIdSeq = 7000;
function nextLeaveId(): string {
  leaveIdSeq += 1;
  return `leave-mock-${leaveIdSeq.toString(16).padStart(6, "0")}`;
}

/* -------------------------------------------------------------------------- */
/*  In-memory fixtures                                                        */
/* -------------------------------------------------------------------------- */

/** Mutable in-memory store so mock mutations persist across reads. */
const MOCK_LEAVE_STORE: Leave[] = [
  {
    id: "leave-mock-1",
    doctor_id: "doc-profile-1",
    doctor_name: "Sara Ahmadi",
    start_date: "2025-01-20",
    end_date: "2025-01-20",
    reason: "مرخصی استحقاقی",
    status: "approved",
  },
  {
    id: "leave-mock-2",
    doctor_id: "doc-profile-2",
    doctor_name: "Reza Mohammadi",
    start_date: "2025-02-10",
    end_date: "2025-02-12",
    reason: "بیماری",
    status: "pending",
  },
];

/* -------------------------------------------------------------------------- */
/*  Backend response shape + mapping                                          */
/* -------------------------------------------------------------------------- */

/**
 * Raw backend leave payload.
 *
 * Mirrors [`schedule.LeaveResponse`](../../../internal/schedule/schedule.go):
 * the backend models a single `date` and a required `reason`, with no status,
 * end-date or denormalized doctor name.
 */
interface LeaveBackendResponse {
  id: string;
  doctor_id: string;
  date?: string;
  reason?: string;
}

/** Raw backend payload accepted by create (`date` instead of a date range). */
interface LeaveBackendRequest {
  doctor_id: string;
  date: string;
  reason: string;
}

/**
 * Normalizes a backend leave response into the admin-facing {@link Leave}.
 *
 * The single backend `date` becomes both `start_date` and `end_date`. `status`
 * defaults to `approved` for display (the backend does not model leave status).
 * `doctor_name` is intentionally left unset here; callers resolve it from the
 * doctors list.
 */
function toLeave(l: LeaveBackendResponse): Leave {
  const date = l.date ?? new Date().toISOString().slice(0, 10);
  return {
    id: l.id,
    doctor_id: l.doctor_id,
    start_date: date,
    end_date: date,
    reason: l.reason,
    status: "approved",
  };
}

/* -------------------------------------------------------------------------- */
/*  CRUD functions                                                            */
/* -------------------------------------------------------------------------- */

/** Fetch leaves, optionally filtered by doctor. */
export async function listLeaves(doctorId?: string): Promise<Leave[]> {
  if (USE_LEAVE_MOCK) {
    await delay(300);
    const all = MOCK_LEAVE_STORE.map((l) => ({ ...l }));
    return doctorId ? all.filter((l) => l.doctor_id === doctorId) : all;
  }

  const params = doctorId ? { doctor_id: doctorId } : undefined;
  const res = await apiClient.get<LeaveBackendResponse[]>(
    "/v1/schedule/leaves",
    { params },
  );
  return res.data.map(toLeave);
}

/** Fetch a single leave by id. */
export async function getLeave(id: string): Promise<Leave> {
  if (USE_LEAVE_MOCK) {
    await delay(250);
    const l = MOCK_LEAVE_STORE.find((x) => x.id === id);
    if (!l) throw new Error(`Leave ${id} not found`);
    return { ...l };
  }

  const res = await apiClient.get<LeaveBackendResponse>(
    `/v1/schedule/leaves/${id}`,
  );
  return toLeave(res.data);
}

/** Create a new leave. The backend only models a single `date`, so `start_date`
 *  is sent as that date. */
export async function createLeave(req: LeaveRequest): Promise<Leave> {
  if (USE_LEAVE_MOCK) {
    await delay(400);
    const created: Leave = {
      id: nextLeaveId(),
      doctor_id: req.doctor_id,
      start_date: req.start_date,
      end_date: req.end_date,
      reason: req.reason,
      status: "pending",
    };
    MOCK_LEAVE_STORE.push(created);
    return { ...created };
  }

  const payload: LeaveBackendRequest = {
    doctor_id: req.doctor_id,
    date: req.start_date,
    reason: req.reason ?? "",
  };
  const res = await apiClient.post<LeaveBackendResponse>(
    "/v1/schedule/leaves",
    payload,
  );
  return toLeave(res.data);
}

/** Delete a leave by id. */
export async function deleteLeave(id: string): Promise<void> {
  if (USE_LEAVE_MOCK) {
    await delay(300);
    const idx = MOCK_LEAVE_STORE.findIndex((x) => x.id === id);
    if (idx !== -1) MOCK_LEAVE_STORE.splice(idx, 1);
    return;
  }

  await apiClient.delete(`/v1/schedule/leaves/${id}`);
}

/* -------------------------------------------------------------------------- */
/*  Time blocks                                                               */
/* -------------------------------------------------------------------------- */

/** Extract `"YYYY-MM-DD"` from a plain date or full ISO datetime. */
function datePart(iso: string | undefined): string {
  if (!iso) return "";
  return iso.split("T")[0]?.slice(0, 10) ?? iso.slice(0, 10);
}

/** Normalize a backend time-block payload into the client {@link TimeBlock} shape. */
function toTimeBlock(b: TimeBlock): TimeBlock {
  return {
    ...b,
    date: datePart(b.date),
  };
}

/**
 * Create a blocked-off chunk of a doctor's calendar.
 *
 * Real endpoint: `POST /v1/schedule/time-blocks`.
 */
export async function createTimeBlock(
  req: CreateTimeBlockRequest,
): Promise<TimeBlock> {
  const res = await apiClient.post<TimeBlock>("/v1/schedule/time-blocks", req);
  return toTimeBlock(res.data);
}

/**
 * Fetch a doctor's time blocks, optionally narrowed to a date.
 *
 * Real endpoint: `GET /v1/schedule/time-blocks?doctor_id=&date=`.
 */
export async function fetchTimeBlocks(
  doctorId: string,
  date?: string,
): Promise<TimeBlock[]> {
  const params: Record<string, string> = { doctor_id: doctorId };
  if (date) params.date = date;

  const res = await apiClient.get<TimeBlock[]>("/v1/schedule/time-blocks", {
    params,
  });
  return (res.data ?? []).map(toTimeBlock);
}

/** Delete a time block by id. Resolves to `204 No Content`. */
export async function deleteTimeBlock(id: string): Promise<void> {
  await apiClient.delete(`/v1/schedule/time-blocks/${id}`);
}
