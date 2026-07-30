import { redirect } from "next/navigation";
import { getDoctorAccess } from "@/lib/dal/auth";
import { loadDoctorStaff } from "@/lib/dal/organization";
import { logoutAction } from "../actions";
import DoctorStaffClient from "./DoctorStaffClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DoctorStaffPage() {
  const access = await getDoctorAccess();
  if (access.state === "unauthenticated") redirect("/doctor/login");
  if (access.state !== "approved") redirect("/doctor");
  const assignments = await loadDoctorStaff(access.clinician.id);
  return <DoctorStaffClient assignments={assignments} logoutAction={logoutAction} />;
}
