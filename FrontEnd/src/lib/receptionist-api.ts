/**
 * Receptionist creation API for the Doctor portal.
 *
 * Mirrors the JSDoc style of [`doctor-shift-api.ts`](src/lib/doctor-shift-api.ts).
 * Hits the real doctor-only endpoint `POST /v1/doctor/receptionists`
 * (RoleAuth DOCTOR) — there is no mock layer. The backend sets the role to
 * `RECEPTIONIST` and `employer_id` to the calling doctor (from the JWT).
 */

import { apiClient } from "./api";
import type {
  ReceptionistRequest,
  ReceptionistResponse,
} from "@/types/user";

/**
 * Create a receptionist scoped to the signed-in doctor.
 *
 * @param req Phone, password and identity fields for the new receptionist.
 * @returns The created user with role `RECEPTIONIST`.
 */
export async function createReceptionist(
  req: ReceptionistRequest,
): Promise<ReceptionistResponse> {
  const res = await apiClient.post<ReceptionistResponse>(
    "/v1/doctor/receptionists",
    req,
  );
  return res.data;
}

/**
 * List the receptionists scoped to the signed-in doctor.
 *
 * Hits the real doctor-only endpoint `GET /v1/doctor/receptionists`
 * (RoleAuth DOCTOR) and returns the RECEPTIONIST users whose `employer_id` is
 * the calling doctor. The array is empty (never null) when the doctor has no
 * receptionists yet.
 *
 * @returns The doctor's receptionists, ordered by name.
 */
export async function listReceptionists(): Promise<ReceptionistResponse[]> {
  const res = await apiClient.get<ReceptionistResponse[]>(
    "/v1/doctor/receptionists",
  );
  return res.data;
}
