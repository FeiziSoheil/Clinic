// Auth-related types matching the Go backend DTOs for the Clinic Appointment System.

/** Roles supported by the system. Mirror of the backend user role enum. */
export type UserRole = "ADMIN" | "DOCTOR" | "RECEPTIONIST" | "PATIENT";

/**
 * Authenticated application user.
 *
 * Mirrors the backend `UserResponse` JSON shape exactly: the backend persists
 * and returns the name split into `first_name`/`last_name` plus a separate
 * `national_code`. There is no combined `name` field.
 */
export interface User {
  id: string;
  role: UserRole;
  phone: string;
  /**
   * Login username for staff accounts (admin/doctor/receptionist).
   * Patients authenticate exclusively via OTP and never set one, so it is
   * omitted from their JSON shape.
   */
  username?: string;
  first_name: string;
  last_name: string;
  national_code: string;
}

/**
 * Convenience helper: derive a single display string from a user's split name
 * fields. Falls back to the phone when both name parts are empty.
 */
export function fullName(user: Pick<User, "first_name" | "last_name">): string {
  return `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
}

/** Shape returned by the auth (login/register) endpoints. */
export interface AuthResponse {
  user: User;
  token: string;
}

/** Payload for the staff (username + password) login endpoint. */
export interface StaffLoginPayload {
  username: string;
  password: string;
}

/**
 * Shape returned by the OTP "send code" endpoint.
 *
 * The backend never returns the code itself — only the timing hints the client
 * needs to drive its resend countdown.
 */
export interface SendOtpResponse {
  /** Seconds until the issued code expires (drives the single countdown). */
  expires_in: number;
  /** Minimum seconds the client must wait before requesting a new code. */
  resend_in: number;
  /** How many more code resends the user may request before being locked out. */
  remaining_resends: number;
  /** Configured resend quota (for the "N از M" hint). */
  max_resends: number;
}

/** Payload accepted by the OTP verify-login endpoint. */
export interface VerifyOtpLoginPayload {
  phone: string;
  code: string;
}

/** Payload accepted by the OTP verify-register endpoint. */
export interface VerifyOtpRegisterPayload {
  phone: string;
  code: string;
  first_name: string;
  last_name: string;
  national_code: string;
}
