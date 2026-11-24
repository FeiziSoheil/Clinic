/**
 * Admin per-doctor patient & receptionist (secretary) CRUD.
 *
 * Hits `/v1/admin/doctors/:doctorUserId/...` (RoleAuth ADMIN). The route
 * parameter is the DOCTOR user's ObjectID (`AdminDoctor.user_id`), not the
 * clinic DoctorProfile id.
 */

import { apiClient } from "./api";
import type {
  AdminPatient,
  AdminReceptionist,
  CreateAdminPatientRequest,
  CreateAdminReceptionistRequest,
  UpdateAdminPatientRequest,
  UpdateAdminReceptionistRequest,
} from "@/types/admin-roster";

/* -------------------------------------------------------------------------- */
/*  Patients                                                                  */
/* -------------------------------------------------------------------------- */

/** List PATIENT accounts assigned to the given doctor user id. */
export async function listDoctorPatients(
  doctorUserId: string,
): Promise<AdminPatient[]> {
  const res = await apiClient.get<AdminPatient[]>(
    `/v1/admin/doctors/${doctorUserId}/patients`,
  );
  return res.data ?? [];
}

/** Create a PATIENT assigned to the given doctor user id. */
export async function createDoctorPatient(
  doctorUserId: string,
  req: CreateAdminPatientRequest,
): Promise<AdminPatient> {
  const res = await apiClient.post<AdminPatient>(
    `/v1/admin/doctors/${doctorUserId}/patients`,
    req,
  );
  return res.data;
}

/** Update a PATIENT assigned to the given doctor user id. */
export async function updateDoctorPatient(
  doctorUserId: string,
  patientId: string,
  req: UpdateAdminPatientRequest,
): Promise<AdminPatient> {
  const res = await apiClient.put<AdminPatient>(
    `/v1/admin/doctors/${doctorUserId}/patients/${patientId}`,
    req,
  );
  return res.data;
}

/** Delete a PATIENT: unlink from this doctor (default) or hard-delete account. */
export async function deleteDoctorPatient(
  doctorUserId: string,
  patientId: string,
  mode: "unlink" | "hard" = "unlink",
): Promise<void> {
  await apiClient.delete(
    `/v1/admin/doctors/${doctorUserId}/patients/${patientId}`,
    { params: { mode } },
  );
}

/* -------------------------------------------------------------------------- */
/*  Receptionists (secretaries)                                               */
/* -------------------------------------------------------------------------- */

/** List RECEPTIONIST accounts scoped to the given doctor user id. */
export async function listDoctorReceptionists(
  doctorUserId: string,
): Promise<AdminReceptionist[]> {
  const res = await apiClient.get<AdminReceptionist[]>(
    `/v1/admin/doctors/${doctorUserId}/receptionists`,
  );
  return res.data ?? [];
}

/** Create a RECEPTIONIST scoped to the given doctor user id. */
export async function createDoctorReceptionist(
  doctorUserId: string,
  req: CreateAdminReceptionistRequest,
): Promise<AdminReceptionist> {
  const res = await apiClient.post<AdminReceptionist>(
    `/v1/admin/doctors/${doctorUserId}/receptionists`,
    req,
  );
  return res.data;
}

/** Update a RECEPTIONIST scoped to the given doctor user id. */
export async function updateDoctorReceptionist(
  doctorUserId: string,
  receptionistId: string,
  req: UpdateAdminReceptionistRequest,
): Promise<AdminReceptionist> {
  const res = await apiClient.put<AdminReceptionist>(
    `/v1/admin/doctors/${doctorUserId}/receptionists/${receptionistId}`,
    req,
  );
  return res.data;
}

/** Delete a RECEPTIONIST scoped to the given doctor user id. */
export async function deleteDoctorReceptionist(
  doctorUserId: string,
  receptionistId: string,
): Promise<void> {
  await apiClient.delete(
    `/v1/admin/doctors/${doctorUserId}/receptionists/${receptionistId}`,
  );
}
