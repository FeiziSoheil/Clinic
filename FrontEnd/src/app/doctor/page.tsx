import { redirect } from "next/navigation";

/**
 * Doctor panel root — send authenticated doctors to the home dashboard.
 *
 * The layout still guards the subtree; this route only exists so `/doctor`
 * resolves cleanly instead of 404ing.
 */
export default function DoctorIndexPage() {
  redirect("/doctor/dashboard");
}
