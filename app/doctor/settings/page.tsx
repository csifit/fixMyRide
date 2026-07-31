import { redirect } from "next/navigation";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadDoctorWorkspace } from "@/lib/dal/workspaces";
import DoctorSettingsClient from "./DoctorSettingsClient";
import { logoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function DoctorSettingsPage() {
  const access = await getDoctorAccess();
  if (access.state === "unauthenticated") redirect("/doctor/login");
  if (access.state !== "approved") redirect("/doctor");
  const workspace = await loadDoctorWorkspace();
  if (!workspace) redirect("/doctor");
  return <DoctorSettingsClient workspace={workspace} logoutAction={logoutAction} />;
}
