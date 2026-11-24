"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { useRequireAuth } from "@/hooks/useRequireAuth";
import { getLoginPath } from "@/lib/login-routes";
import { getRoleHomePath } from "@/lib/role-redirect";
import type { UserRole } from "@/types/auth";

interface RequireAuthProps {
  /** The protected content to render when authorized. */
  children: React.ReactNode;
  /** Optional allow-list of roles permitted to view this route. */
  allowedRoles?: UserRole[];
}

/**
 * Guard wrapper component for protected client routes.
 *
 * Renders a centered spinner while the auth store is hydrating. Once hydrated
 * it redirects unauthorized/ unauthenticated users appropriately:
 *
 * - No user            → role-aware login URL
 * - Authenticated but role mismatch → the user's role home path
 *
 * Only authenticated and authorized users see `children`.
 *
 * Usage:
 * ```tsx
 * <RequireAuth allowedRoles={["ADMIN"]}>
 *   <AdminDashboard />
 * </RequireAuth>
 * ```
 */
export function RequireAuth({ children, allowedRoles }: RequireAuthProps) {
  const { isLoading, isAuthorized, user } = useRequireAuth(allowedRoles);
  const router = useRouter();
  const allowedRolesRef = useRef(allowedRoles);
  allowedRolesRef.current = allowedRoles;

  useEffect(() => {
    // Avoid acting on redirects until hydration completes.
    if (isLoading) return;

    if (!user) {
      // Preserve the protected URL so post-OTP resume can return here
      // (e.g. /appointments/checkout after public booking).
      const next =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : undefined;
      router.replace(getLoginPath(allowedRolesRef.current, next));
      return;
    }

    if (!isAuthorized && user) {
      // Authenticated but role not permitted → send to their own dashboard.
      router.replace(getRoleHomePath(user.role));
    }
  }, [isLoading, isAuthorized, user, router]);

  // Show a centered spinner while hydrating or while a redirect is pending.
  if (isLoading || !isAuthorized) {
    return (
      <div className="flex min-h-screen w-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}

export default RequireAuth;
