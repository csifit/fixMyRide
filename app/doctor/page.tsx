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
  if (access.state === "unavailable") {
    return <AccessStatusScreen status="unavailable" />;
  }
  if (access.state !== "approved") {
    return <AccessStatusScreen status={access.state} />;
  }

  let data;
  try {
    data = await loadDoctorDashboard(access.clinician);
  } catch {
    return <AccessStatusScreen status="unavailable" />;
  }
  return (
    <DoctorPortal
      initialData={data}
      logoutAction={logoutAction}
      viewPatientAction={viewPatientProfileAction}
      updateConditionNoteAction={updateConditionNoteAction}
    />
  );
}
