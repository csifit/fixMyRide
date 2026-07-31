import DoctorPortal from "./DoctorPortalClient";
import { redirect } from "next/navigation";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadDoctorDashboard } from "@/lib/dal/doctor";
import { loadDoctorWorkspace } from "@/lib/dal/workspaces";
import AccessStatusScreen from "./AccessStatusScreen";
import {
  createLifeThreateningDiagnosisAction,
  deactivateLifeThreateningDiagnosisAction,
  logoutAction,
  reactivateLifeThreateningDiagnosisAction,
  readSensitiveIdentifiersAction,
  updateHealthCardProfileAction,
  updateLifeThreateningDiagnosisAction,
  updateSensitiveIdentifiersAction,
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
  let workspace;
  try {
    [data, workspace] = await Promise.all([
      loadDoctorDashboard(access.clinician),
      loadDoctorWorkspace(),
    ]);
  } catch {
    return <AccessStatusScreen status="unavailable" />;
  }
  return (
    <DoctorPortal
      initialData={data}
      canEditBilling={workspace?.canEditBilling ?? false}
      logoutAction={logoutAction}
      createLifeThreateningDiagnosisAction={
        createLifeThreateningDiagnosisAction
      }
      deactivateLifeThreateningDiagnosisAction={
        deactivateLifeThreateningDiagnosisAction
      }
      reactivateLifeThreateningDiagnosisAction={
        reactivateLifeThreateningDiagnosisAction
      }
      readSensitiveIdentifiersAction={readSensitiveIdentifiersAction}
      updateHealthCardProfileAction={updateHealthCardProfileAction}
      updateLifeThreateningDiagnosisAction={
        updateLifeThreateningDiagnosisAction
      }
      updateSensitiveIdentifiersAction={
        updateSensitiveIdentifiersAction
      }
      viewPatientAction={viewPatientProfileAction}
      updateConditionNoteAction={updateConditionNoteAction}
    />
  );
}
