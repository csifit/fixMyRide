import { redirect } from "next/navigation";
import { getAccountingAccess } from "@/lib/dal/admin-auth";
import { loadCommercialAdmin } from "@/lib/dal/commercial-admin";
import CommercialAdminClient from "./CommercialAdminClient";
import { adminLogoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlatformInvoicingPage() {
  const access = await getAccountingAccess();
  if (access.state === "unauthenticated") redirect("/admin/login");
  if (access.state === "mfa_required") redirect("/admin/mfa/challenge");
  if (access.state !== "authorized") redirect("/admin");
  const data = await loadCommercialAdmin();
  return <CommercialAdminClient data={data} displayName={access.administrator.displayName} canManageStatus={["superadmin", "admin"].includes(access.administrator.role)} logoutAction={adminLogoutAction} />;
}
