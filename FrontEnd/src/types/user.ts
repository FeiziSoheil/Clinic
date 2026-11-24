/**
 * Receptionist domain types for the Doctor portal.
 *
 * Maps the Go [`UserResponse`](../../../internal/user/user.go) shape and the
 * `CreateReceptionistRequest` DTO used by the doctor-only
 * `POST /v1/doctor/receptionists` endpoint to TypeScript. Field names keep
 * snake_case JSON keys to match the backend DTOs verbatim.
 */

/**
 * Payload to create a receptionist.
 *
 * Maps to the backend `CreateReceptionistRequest`: the backend sets the role to
 * `RECEPTIONIST` and `employer_id` to the calling doctor (from the JWT).
 */
export interface ReceptionistRequest {
  phone: string;
  /**
   * Login username for the RECEPTIONIST account. Staff authenticate with
   * username + password (patients use OTP), so this is required.
   */
  username: string;
  password: string;
  first_name: string;
  last_name: string;
  national_code: string;
}

/**
 * Receptionist record returned by the backend.
 *
 * Matches the `UserResponse` shape: `role` is always `RECEPTIONIST` and
 * `employer_id` is the hex id of the owning doctor.
 */
export interface ReceptionistResponse {
  id: string;
  phone: string;
  /**
   * Login username for the RECEPTIONIST account. Staff authenticate by username
   * + password (patients use OTP), so it is returned by the backend for staff
   * records and useful for the owning doctor to display.
   */
  username?: string;
  role: "RECEPTIONIST";
  first_name: string;
  last_name: string;
  national_code: string;
  /** Hex id of the doctor that owns this receptionist. */
  employer_id?: string;
}
