import DoctorPortal from "./DoctorPortalClient";
import { redirect } from "next/navigation";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadDoctorDashboard } from "@/lib/dal/doctor";
import AccessStatusScreen from "./AccessStatusScreen";
import {
  logoutAction,
  updateConditionNoteAction,
  viewPatientProfileAction,
} from "./actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorPage() {
  const access = await getDoctorAccess();
  if (access.state === "unauthenticated") redirect("/doctor/login");
  if (access.state !== "approved") {
    return <AccessStatusScreen status={access.state} />;
  }

  const data = await loadDoctorDashboard(access.clinician);
  return (
    <DoctorPortal
      initialData={data}
      logoutAction={logoutAction}
      viewPatientAction={viewPatientProfileAction}
      updateConditionNoteAction={updateConditionNoteAction}
    />
  );
}
