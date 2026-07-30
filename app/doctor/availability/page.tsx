import { redirect } from "next/navigation";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadDoctorAvailability } from "@/lib/dal/appointments";
import AccessStatusScreen from "../AccessStatusScreen";
import AvailabilityClient from "./AvailabilityClient";

export const dynamic = "force-dynamic";

export default async function DoctorAvailabilityPage() {
  const access = await getDoctorAccess();
  if (access.state === "unauthenticated") redirect("/doctor/login");
  if (access.state !== "approved") return <AccessStatusScreen status={access.state} />;
  let availability;
  try {
    availability = await loadDoctorAvailability([access.clinician.id]);
  } catch {
    return <AccessStatusScreen status="unavailable" />;
  }
  return <AvailabilityClient availability={availability} />;
}
