import { redirect } from "next/navigation";

/**
 * Legacy route: visit settings now live on `/doctor/shifts`.
 * Keep this path so old bookmarks and links still work.
 */
export default function DoctorSettingsRedirectPage() {
  redirect("/doctor/shifts");
}
