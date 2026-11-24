import type { UserRole } from "@/types/auth";

export type LoginAs = "patient" | "staff";

export function loginPath(as: LoginAs): string {
  return `/login?as=${as}`;
}

export function parseLoginAs(value: string | null | undefined): LoginAs | null {
  if (value === "patient" || value === "staff") return value;
  return null;
}

/** Pick the login URL that matches the route's allowed roles. */
export function getLoginPath(
  allowedRoles?: UserRole[],
  next?: string,
): string {
  let base = "/login";
  if (allowedRoles?.length === 1 && allowedRoles[0] === "PATIENT") {
    base = loginPath("patient");
  } else if (allowedRoles?.length && !allowedRoles.includes("PATIENT")) {
    base = loginPath("staff");
  }

  if (!next) return base;
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}next=${encodeURIComponent(next)}`;
}
