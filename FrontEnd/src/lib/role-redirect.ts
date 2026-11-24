import type { UserRole } from "@/types/auth";
import { BOOKING_RESUME_TO_KEY } from "@/lib/booking-session";

/**
 * Maps a user role to its default landing/home path after authentication.
 *
 * Used by route guards and post-logout/login redirects so every role lands on a
 * page appropriate to their permissions.
 *
 * @param role - The authenticated user's role.
 * @returns The absolute path that serves as the role's home dashboard.
 */
export function getRoleHomePath(role: UserRole): string {
  switch (role) {
    case "ADMIN":
      return "/admin/dashboard";
    case "DOCTOR":
      return "/doctor/dashboard";
    case "RECEPTIONIST":
      return "/reception/queue";
    case "PATIENT":
    default:
      return "/doctors";
  }
}

/**
 * Resolve the post-auth redirect, honoring a stashed booking resume target for
 * patients. When a patient was sent to OTP from the public booking flow, this
 * returns `/appointments/checkout` (or a legacy `/booking` target) so payment
 * continues in the patient panel. Staff roles always go to their dashboard.
 */
export function resolveAuthRedirect(role: UserRole): string {
  if (role === "PATIENT" && typeof window !== "undefined") {
    const resumeTo = window.sessionStorage.getItem(BOOKING_RESUME_TO_KEY);
    if (resumeTo) {
      // Legacy public commit path → patient checkout.
      if (resumeTo === "/booking") return "/appointments/checkout";
      return resumeTo;
    }
  }
  return getRoleHomePath(role);
}
