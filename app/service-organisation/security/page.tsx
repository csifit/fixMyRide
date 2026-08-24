import { redirect } from "next/navigation";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadProviderMfaStatus } from "@/lib/dal/provider-mfa";
import ProviderSecurityClient from "@/app/provider-security/ProviderSecurityClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ServiceOrganisationSecurityPage() {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const mfa = await loadProviderMfaStatus();
  return <ProviderSecurityClient
    role="service_organisation"
    factor={mfa.state === "ready" ? mfa.factor : null}
    unavailable={mfa.state === "unavailable"}
  />;
}
