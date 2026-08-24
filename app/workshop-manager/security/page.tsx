import { redirect } from "next/navigation";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadProviderMfaStatus } from "@/lib/dal/provider-mfa";
import ProviderSecurityClient from "@/app/provider-security/ProviderSecurityClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkshopManagerSecurityPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  if ((await getServiceOrganisationAccess()).state === "active") {
    redirect("/service-organisation/security");
  }
  const mfa = await loadProviderMfaStatus();
  return <ProviderSecurityClient
    role="workshop_manager"
    factor={mfa.state === "ready" ? mfa.factor : null}
    unavailable={mfa.state === "unavailable"}
  />;
}
