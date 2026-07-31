import { redirect } from "next/navigation";
import { getPatientAccess } from "@/lib/dal/patient-appointments";
import PatientLoginForm from "./PatientLoginForm";

export const dynamic = "force-dynamic";

export default async function PatientLoginPage() {
  const access = await getPatientAccess();
  if (access.state === "active") redirect("/patient/appointments");
  return <PatientLoginForm configured={access.state !== "configuration"} />;
}
