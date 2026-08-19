import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import CustomerInvoicingSettingsClient from "@/app/customer-invoicing/CustomerInvoicingSettingsClient";
import { loadCustomerInvoicingPreferences } from "@/lib/dal/customer-invoicing";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";

export const dynamic = "force-dynamic";

export default async function WorkshopManagerInvoicingPage() {
  const organisationAccess = await getServiceOrganisationAccess();
  if (organisationAccess.state === "active") redirect("/service-organisation/billing");
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const preferences = await loadCustomerInvoicingPreferences();
  return <CustomerInvoicingSettingsClient
    preferences={preferences}
    mode="workshop"
    logoutAction={platformLogoutAction}
  />;
}
