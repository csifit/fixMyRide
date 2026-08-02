import { redirect } from "next/navigation";
import { getPatientAccess } from "@/lib/dal/patient-appointments";
import PatientPortal from "../PatientPortalClient";
import { patientPortalData } from "../demo-data";

export const dynamic = "force-dynamic";

export default async function PatientMedicalFolderPage() {
  const access = await getPatientAccess();
  if (access.state === "unauthenticated") redirect("/patient/login");
  if (access.state !== "active") redirect("/patient/appointments");
  return <PatientPortal data={patientPortalData} />;
}
