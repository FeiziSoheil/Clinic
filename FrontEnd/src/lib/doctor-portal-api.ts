/**
 * Doctor Portal read operations: daily schedule/queue, earnings and wallet.
 *
 * The earnings, revenue-share transactions and wallet balance are now fully
 * backed by the real finance endpoints
 * (`GET /api/v1/finance/doctor/earnings`, `…/doctor/transactions`,
 * `…/doctor/wallet`). There is NO mock layer for earnings any more — every
 * number is aggregated server-side from settled invoices.
 *
 * The daily schedule/queue keeps a mock fallback (gated on
 * {@link USE_SCHEDULE_MOCK}, defaulting to `false`) so the screen is explorable
 * without a running backend; in production it hits the live
 * `GET /api/v1/doctors/me/schedule`. Mock generators reuse the shared
 * `hashString` helper from [`mock-data.ts`](src/lib/mock-data.ts).
 */

import { apiClient } from "./api";
import { useAuthStore } from "@/store/authStore";
import { hashString } from "./mock-data";
import type { TransactionResponse } from "@/types/finance";
import type {
  DoctorEarningsRange,
  DoctorEarningsSummary,
  DoctorProfileSettings,
  DoctorScheduleItem,
  DoctorScheduleResponse,
  DoctorWallet,
  UpdateDoctorProfileSettingsRequest,
} from "@/types/doctor-portal";

/**
 * Master switch for the (non-payment) daily-schedule/queue mock layer. The real
 * endpoint `GET /v1/doctors/me/schedule` is deployed, so this defaults to
 * `false` and the schedule runs against the live database.
 */
export const USE_SCHEDULE_MOCK = false;

/** Resolve after `ms` — simulates network latency in the mock branch. */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Small patient-name pool for the mock schedule generator. */
const PATIENT_NAMES = [
  "Sara Mohammadi",
  "Reza Ahmadi",
  "Maryam Hosseini",
  "Ali Karimi",
  "Zahra Nabavi",
  "Hossein Rezaei",
  "Narges Farahani",
  "Mohammad Sadeghi",
  "Fatemeh Ebrahimi",
  "Amir Kazemi",
  "Parisa Moradi",
  "Saeed Ghasemi",
];

/** Visit reason / chief complaint pool for the mock schedule generator. */
const REASONS = [
  "Follow-up",
  "Fever",
  "Back pain",
  "Annual checkup",
  "Migraine",
  "Skin rash",
  "Sore throat",
  "High blood pressure",
];

/** Convert minutes since midnight back to `"HH:mm"`. */
function toHHmm(minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0");
  const m = String(minutes % 60).padStart(2, "0");
  return `${h}:${m}`;
}

/**
 * Fetch the signed-in doctor's daily schedule/queue.
 *
 * Real endpoint: `GET /v1/doctors/me/schedule?date=YYYY-MM-DD`.
 *
 * In mock mode 8–12 patients are generated deterministically for the given
 * date. Statuses are distributed (mostly WAITING with queue positions, one
 * IN_ROOM, a couple COMPLETED, one NO_SHOW). Visit times step by 30 minutes
 * from 09:00.
 */
export async function fetchDoctorSchedule(
  date: string,
): Promise<DoctorScheduleResponse> {
  if (USE_SCHEDULE_MOCK) {
    await delay(400);

    const doctorId = useAuthStore.getState().user?.id ?? "doc-me";
    const baseSeed = hashString(`${doctorId}:${date}`);
    const count = 8 + (baseSeed % 5); // 8–12 patients

    // Reserve slots: 1 IN_ROOM, 1 NO_SHOW, 2 COMPLETED; rest WAITING.
    const inRoomCount = 1;
    const noShowCount = 1;
    const completedCount = 2;
    const waitingCount = Math.max(
      0,
      count - inRoomCount - noShowCount - completedCount,
    );

    const items: DoctorScheduleItem[] = [];
    let waitingIndex = 0;

    for (let i = 0; i < count; i++) {
      const seed = hashString(`${doctorId}:${date}:${i}`);
      const startMin = 9 * 60 + i * 30; // 30-min slots from 09:00
      const status: DoctorScheduleItem["status"] =
        i === 0
          ? "IN_ROOM"
          : i <= waitingCount
            ? "WAITING"
            : i <= waitingCount + inRoomCount
              ? "IN_ROOM"
              : i <= waitingCount + inRoomCount + completedCount
                ? "COMPLETED"
                : "NO_SHOW";

      const isWaiting = status === "WAITING";
      const item: DoctorScheduleItem = {
        appointment_id: `apt-${date}-${i}`,
        patient_id: `pat-${(seed >>> 4).toString(16).padStart(6, "0")}`,
        patient_name: PATIENT_NAMES[seed % PATIENT_NAMES.length],
        start_time: toHHmm(startMin),
        end_time: toHHmm(startMin + 30),
        status,
        reason: REASONS[(seed >>> 3) % REASONS.length],
        has_ehr: seed % 100 < 40, // ~40% have an existing record
      };

      if (isWaiting) {
        item.queue_position = waitingIndex++;
      }
      items.push(item);
    }

    return {
      doctor_id: doctorId,
      date,
      total: items.length,
      waiting: items.filter((it) => it.status === "WAITING").length,
      in_room: items.filter((it) => it.status === "IN_ROOM").length,
      completed: items.filter((it) => it.status === "COMPLETED").length,
      no_show: items.filter((it) => it.status === "NO_SHOW").length,
      items,
    };
  }

  const res = await apiClient.get<DoctorScheduleResponse>(
    "/v1/doctors/me/schedule",
    { params: { date } },
  );
  return res.data;
}

/**
 * Fetch the signed-in doctor's earnings summary for an inclusive date window.
 *
 * Backed by `GET /api/v1/finance/doctor/earnings?from=&to=` (YYYY-MM-DD).
 */
export async function fetchDoctorEarnings(
  range: DoctorEarningsRange,
): Promise<DoctorEarningsSummary> {
  const res = await apiClient.get<DoctorEarningsSummary>(
    "/v1/finance/doctor/earnings",
    { params: { from: range.from, to: range.to } },
  );
  return res.data;
}

/**
 * Fetch the signed-in doctor's revenue-share & deposit-forfeit transactions
 * for an inclusive date window.
 *
 * Backed by `GET /api/v1/finance/doctor/transactions?from=&to=`.
 */
export async function fetchDoctorRevenueTransactions(
  range: DoctorEarningsRange,
): Promise<TransactionResponse[]> {
  const res = await apiClient.get<TransactionResponse[]>(
    "/v1/finance/doctor/transactions",
    { params: { from: range.from, to: range.to } },
  );
  return res.data;
}

/**
 * Fetch the signed-in doctor's wallet balance.
 *
 * Backed by the real endpoint `GET /api/v1/finance/doctor/wallet`. Returns a
 * zero balance (currency `"Toman"`) when the doctor has no wallet yet.
 */
export async function fetchDoctorWallet(): Promise<DoctorWallet> {
  const res = await apiClient.get<DoctorWallet>("/v1/finance/doctor/wallet");
  return res.data;
}

/**
 * Fetch the signed-in doctor's own profile settings.
 *
 * Backed by the real endpoint `GET /api/v1/doctor/profile`. The owner is
 * resolved from the JWT server-side, so this always returns the caller's own
 * profile.
 */
export async function fetchDoctorSettings(): Promise<DoctorProfileSettings> {
  const res = await apiClient.get<DoctorProfileSettings>("/v1/doctor/profile");
  return res.data;
}

/**
 * Update the signed-in doctor's own pricing settings (visit fee + default visit
 * duration).
 *
 * Backed by the real endpoint `PUT /api/v1/doctor/profile`. Only the
 * doctor-owned fields are sent; identity/specialty stay admin-controlled.
 */
export async function updateDoctorSettings(
  req: UpdateDoctorProfileSettingsRequest,
): Promise<DoctorProfileSettings> {
  const res = await apiClient.put<DoctorProfileSettings>(
    "/v1/doctor/profile",
    req,
  );
  return res.data;
}
