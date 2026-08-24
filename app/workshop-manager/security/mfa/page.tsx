import { redirect } from "next/navigation";
import ProviderMfaChallengeClient from "@/app/provider-security/ProviderMfaChallengeClient";
import { getServiceOrganisationAccess, getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadProviderMfaStatus, safeProviderNext } from "@/lib/dal/provider-mfa";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function WorkshopManagerMfaChallengePage({ searchParams }: {
  searchParams: Promise<{ next?: string }>;
}) {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  if ((await getServiceOrganisationAccess()).state === "active") {
    redirect("/service-organisation/security/mfa");
  }
  const nextHref = safeProviderNext("workshop_manager", (await searchParams).next);
  const mfa = await loadProviderMfaStatus();
  if (mfa.state === "unavailable") redirect("/workshop-manager/security");
  if (!mfa.factor) redirect(nextHref);
  if (mfa.currentLevel === "aal2") redirect(nextHref);
  return <ProviderMfaChallengeClient factorId={mfa.factor.id} nextHref={nextHref} />;
}
