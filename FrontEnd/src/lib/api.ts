import axios from "axios";

import { useAuthStore } from "@/store/authStore";

/** Base URL for the clinic backend API. Falls back to the local dev server. */
const baseURL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api";

/**
 * Pre-configured Axios instance used across the app.
 *
 * Every request is enriched with the `Authorization: Bearer <token>` header
 * (when a token exists in the auth store) via a request interceptor.
 */
export const apiClient = axios.create({
  baseURL,
  headers: {
    "Content-Type": "application/json",
  },
});

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/**
 * Response interceptor: automatic logout on 401.
 *
 * A `401 Unauthorized` can mean one of two things:
 *  - the caller HAD a session that is now invalid/expired (e.g. an authenticated
 *    request whose JWT was revoked) — in that case we clear the persisted auth
 *    store via `useAuthStore.getState().logout()` and hard-redirect to the login
 *    page so the user can choose how to sign in again;
 *  - the caller has NO session and simply failed an authentication ATTEMPT (e.g.
 *    a wrong OTP code on the login/register screens) — in that case we must NOT
 *    redirect or wipe state; the error is re-thrown so the form can show a toast.
 *
 * We distinguish the two by checking whether a token was present: only an
 * existing token turning into a 401 counts as "session expired". Any non-401
 * error is re-thrown unchanged so the calling code's `.catch` / TanStack Query
 * error handling keeps working.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const hadSession = Boolean(useAuthStore.getState().token);
      if (hadSession) {
        useAuthStore.getState().logout();
        // Avoid redirect loops when already on the login page.
        if (
          typeof window !== "undefined" &&
          window.location.pathname !== "/login"
        ) {
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  },
);
