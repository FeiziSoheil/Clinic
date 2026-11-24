import { apiClient } from "@/lib/api";
import type {
  AuthResponse,
  SendOtpResponse,
  StaffLoginPayload,
  User,
  VerifyOtpLoginPayload,
  VerifyOtpRegisterPayload,
} from "@/types/auth";

/** Minimal shape of an Axios error response we read error details from. */
interface ApiErrorResponse {
  response?: {
    status?: number;
    data?: { message?: string; debug?: { retry_after?: number } };
  };
}

/**
 * Extract the lock window (seconds) returned by the OTP send endpoint when the
 * phone has exhausted its resend quota (HTTP 429 with `debug.retry_after`).
 * Returns `undefined` when the error does not carry a lock duration.
 */
export function extractLockSeconds(error: unknown): number | undefined {
  const debug = (error as ApiErrorResponse)?.response?.data?.debug;
  return typeof debug?.retry_after === "number" ? debug.retry_after : undefined;
}

/**
 * Authentication service functions.
 *
 * Thin wrappers around the Axios `apiClient` that talk to the backend `/auth`
 * endpoints. Each function returns strongly-typed data and lets Axios errors
 * propagate to the caller (typically a form submit handler) for display.
 */

/**
 * Authenticate a staff member (admin/doctor/receptionist) with username +
 * password.
 *
 * Staff authenticate exclusively with credentials — patients use OTP instead.
 * The backend `LoginRequest` matches the supplied username against the stored
 * `username`, falling back to `phone` for legacy accounts created before
 * usernames existed.
 *
 * @param payload - Username + password.
 * @returns The authenticated user and JWT token.
 */
export async function loginStaff(payload: StaffLoginPayload): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>("/v1/auth/login", payload);
  return data;
}

/**
 * Register a new patient account.
 *
 * The payload matches the backend `RegisterRequest` DTO exactly: the name is
 * sent split into `first_name`/`last_name`, and `national_code` is required.
 *
 * @param payload - Registration payload.
 * @returns The newly created user and JWT token.
 */
export async function registerUser(payload: {
  first_name: string;
  last_name: string;
  national_code: string;
  phone: string;
  password: string;
}): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    "/v1/auth/register",
    payload
  );
  return data;
}

/**
 * Fetch the currently authenticated user.
 *
 * Used on app load to validate the persisted token against the backend
 * (GET `/v1/auth/profile`). The request interceptor in `src/lib/api.ts`
 * attaches the stored token automatically.
 *
 * @returns The authenticated user.
 */
export async function getCurrentUser(): Promise<User> {
  const { data } = await apiClient.get<User>("/v1/auth/profile");
  return data;
}

// ---------------------------------------------------------------------------
// OTP (one-time password) authentication.
//
// Patients authenticate exclusively via OTP: they request a code sent over SMS
// to their phone, then verify it to either log an existing account in
// (`verifyOtpLogin`) or register a brand-new account (`verifyOtpRegister`).
// The password-based functions above remain in use by privileged staff
// (admin/doctor/receptionist) accounts.
// ---------------------------------------------------------------------------

/**
 * Request a one-time code be sent over SMS to the given phone.
 *
 * The endpoint is flow-agnostic (it does not reveal whether the phone is
 * already registered); the login vs register distinction is made at
 * verification time. Returns the timing hints needed to drive the resend
 * countdown UI.
 *
 * @param phone - Destination mobile number.
 */
export async function sendOtp(phone: string): Promise<SendOtpResponse> {
  const { data } = await apiClient.post<SendOtpResponse>(
    "/v1/auth/otp/send",
    { phone },
  );
  return data;
}

/**
 * Verify an OTP code and authenticate an existing account.
 *
 * @param payload - Phone + code.
 * @returns The authenticated user and JWT token.
 */
export async function verifyOtpLogin(
  payload: VerifyOtpLoginPayload,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    "/v1/auth/otp/login",
    payload,
  );
  return data;
}

/**
 * Verify an OTP code and create a new patient account.
 *
 * The code MUST be verified before the account is created, so the profile
 * fields are sent together with the phone + code in a single request.
 *
 * @param payload - Phone + code + profile fields.
 * @returns The newly created user and JWT token.
 */
export async function verifyOtpRegister(
  payload: VerifyOtpRegisterPayload,
): Promise<AuthResponse> {
  const { data } = await apiClient.post<AuthResponse>(
    "/v1/auth/otp/register",
    payload,
  );
  return data;
}

/**
 * Map an OTP auth error to a user-facing Persian message.
 *
 * The backend returns generic English messages (e.g. "unauthorized"); for the
 * OTP screens we want actionable Persian copy keyed off the HTTP status so the
 * user knows whether to correct the code, register, log in, or just wait.
 *
 * @param error - The thrown error (typically an Axios error).
 * @param fallback - Message used when the status is unrecognized.
 */
export function otpErrorMessage(error: unknown, fallback: string): string {
  const response = (error as ApiErrorResponse)?.response;
  // No HTTP response at all → a connectivity failure.
  if (!response) {
    return "ارتباط با سرور برقرار نشد.";
  }
  switch (response.status) {
    case 401:
      return "کد وارد شده صحیح نیست.";
    case 404:
      return "حساب کاربری با این شماره یافت نشد. ابتدا ثبت‌نام کنید.";
    case 409:
      return "این شماره قبلاً ثبت‌نام کرده است. وارد شوید.";
    case 429:
      return "ارسال کد موقتاً غیرفعال شده است.";
    case 500:
    case 502:
    case 503:
      return "ارسال پیامک با خطا مواجه شد. دوباره تلاش کنید.";
    default:
      return fallback;
  }
}
