import { redirect } from "next/navigation";
import { getAccountingAccess } from "@/lib/dal/admin-auth";
import { loadBillingRates, loadPlatformBillingUsage } from "@/lib/dal/invoicing";
import PlatformBillingClient from "./PlatformBillingClient";
import { adminLogoutAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function PlatformInvoicingPage() {
  const access = await getAccountingAccess();
  if (access.state === "unauthenticated") redirect("/admin/login");
  if (access.state === "mfa_required") redirect("/admin/mfa/challenge");
  if (access.state !== "authorized") redirect("/admin");
  const [usage, rates] = await Promise.all([loadPlatformBillingUsage(), loadBillingRates()]);
  return <PlatformBillingClient usage={usage} rates={rates} displayName={access.administrator.displayName} logoutAction={adminLogoutAction} />;
}
