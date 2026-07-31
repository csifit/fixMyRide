import { redirect } from "next/navigation";
import {
  getAdminAccess,
  getAccountingAccess,
  getAdminMfaDestination,
} from "@/lib/dal/admin-auth";
import AdminAccessStatusScreen from "../AccessStatusScreen";
import AdminLoginForm from "./AdminLoginForm";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminLoginPage() {
  const access = await getAdminAccess();
  if (access.state === "authorized") redirect("/admin");
  if (access.state === "mfa_required") {
    const mfa = await getAdminMfaDestination();
    if (mfa.state === "security_error") {
      return <AdminAccessStatusScreen status="securityError" />;
    }
    redirect(`${mfa.destination}?next=/admin`);
  }
  if (access.state === "unauthorized") {
    const accounting = await getAccountingAccess();
    if (accounting.state === "authorized") redirect("/admin/invoicing");
    if (accounting.state === "mfa_required") {
      const mfa = await getAdminMfaDestination();
      if (mfa.state === "security_error") return <AdminAccessStatusScreen status="securityError" />;
      redirect(`${mfa.destination}?next=/admin/invoicing`);
    }
    if (accounting.state === "suspended" || accounting.state === "unauthorized") redirect("/admin");
  }
  if (access.state === "suspended") redirect("/admin");
  if (access.state === "unavailable") {
    return <AdminAccessStatusScreen status="unavailable" />;
  }
  return <AdminLoginForm configured={access.state !== "configuration"} />;
}
