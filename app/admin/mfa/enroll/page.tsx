import { redirect } from "next/navigation";
import AdminAccessStatusScreen from "../../AccessStatusScreen";
import {
  getAdminAccess,
  getAdminMfaDestination,
} from "@/lib/dal/admin-auth";
import MfaEnrollmentClient from "../MfaEnrollmentClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMfaEnrollmentPage() {
  const access = await getAdminAccess();
  if (access.state === "unauthenticated") redirect("/admin/login");
  if (access.state === "authorized") redirect("/admin");
  if (access.state === "configuration") {
    return <AdminAccessStatusScreen status="configuration" />;
  }
  if (access.state === "unavailable") {
    return <AdminAccessStatusScreen status="unavailable" />;
  }
  if (access.state === "unauthorized" || access.state === "suspended") {
    return <AdminAccessStatusScreen status={access.state} />;
  }
  const mfa = await getAdminMfaDestination();
  if (mfa.state === "security_error") {
    return <AdminAccessStatusScreen status="securityError" />;
  }
  if (mfa.state === "challenge_required") redirect(mfa.destination);
  return <MfaEnrollmentClient />;
}
