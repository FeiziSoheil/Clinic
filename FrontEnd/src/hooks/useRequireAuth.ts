import { useEffect, useState } from "react";

import { useAuthStore } from "@/store/authStore";
import type { User, UserRole } from "@/types/auth";

/** Result returned by the {@link useRequireAuth} hook. */
interface RequireAuthResult {
  /** `true` until the persisted store has hydrated on the client. */
  isLoading: boolean;
  /** `true` when hydrated, authenticated and (optionally) role-authorized. */
  isAuthorized: boolean;
  /** The current user, or `null` if not authenticated. */
  user: User | null;
}

/**
 * Client-side route guard hook.
 *
 * Because {@link useAuthStore} uses Zustand's `persist` middleware, the store
 * state is `null`/empty during the first server render and only gets rehydrated
 * from `localStorage` on the client. To avoid a flash of incorrect
 * authorization decisions, we track a `hydrated` flag that flips to `true`
 * after mount. Until then `isLoading` stays `true`.
 *
 * @param allowedRoles - Optional allow-list of roles permitted to view the route.
 * @returns Authorization state for the current route.
 */
export function useRequireAuth(
  allowedRoles?: UserRole[]
): RequireAuthResult {
  const user = useAuthStore((state) => state.user);
  const [hydrated, setHydrated] = useState(false);

  // Flip the hydration flag after the first client render. The persisted store
  // is guaranteed to have rehydrated from localStorage by this point.
  useEffect(() => {
    // Intentional: flip hydration flag once on the client after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  const isAuthenticated = hydrated && user !== null;

  const isAuthorized =
    hydrated &&
    user !== null &&
    (!allowedRoles || allowedRoles.includes(user.role));

  return {
    isLoading: !hydrated,
    isAuthorized,
    user: isAuthenticated ? user : null,
  };
}
