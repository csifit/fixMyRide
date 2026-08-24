import { redirect } from "next/navigation";
import ProviderMfaChallengeClient from "@/app/provider-security/ProviderMfaChallengeClient";
import { getServiceOrganisationAccess } from "@/lib/dal/platform-access";
import { loadProviderMfaStatus, safeProviderNext } from "@/lib/dal/provider-mfa";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ServiceOrganisationMfaChallengePage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const access = await getServiceOrganisationAccess();
  if (access.state === "unauthenticated") redirect("/service-organisation/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const nextHref = safeProviderNext("service_organisation", (await searchParams).next);
  const mfa = await loadProviderMfaStatus();
  if (mfa.state === "unavailable") redirect("/service-organisation/security");
  if (!mfa.factor) redirect(nextHref);
  if (mfa.currentLevel === "aal2") redirect(nextHref);
  return <ProviderMfaChallengeClient factorId={mfa.factor.id} nextHref={nextHref} />;
}
