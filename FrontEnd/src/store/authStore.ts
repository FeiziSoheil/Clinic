import { create } from "zustand";
import { persist } from "zustand/middleware";

import type { User } from "@/types/auth";

/** Shape of the auth store. */
interface AuthState {
  user: User | null;
  token: string | null;
  login: (user: User, token: string) => void;
  logout: () => void;
}

/**
 * Global client-side auth store.
 *
 * Persisted to `localStorage` under the "auth-storage" key so the session
 * survives page reloads. The token is read by the Axios request interceptor
 * in `src/lib/api.ts` via `useAuthStore.getState().token`.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (user, token) => set({ user, token }),
      logout: () => set({ user: null, token: null }),
    }),
    {
      name: "auth-storage",
    }
  )
);
