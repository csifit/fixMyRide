import { redirect } from "next/navigation";
import AdminAccessStatusScreen from "../../AccessStatusScreen";
import {
  getAdminAccess,
  getAccountingAccess,
  getAdminMfaDestination,
} from "@/lib/dal/admin-auth";
import MfaChallengeClient from "./MfaChallengeClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminMfaChallengePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requestedNext = (await searchParams).next;
  const nextHref = requestedNext === "/admin/invoicing" ? requestedNext : "/admin";
  const adminAccess = await getAdminAccess();
  const access = adminAccess.state === "unauthorized" ? await getAccountingAccess() : adminAccess;
  if (access.state === "unauthenticated") redirect("/admin/login");
  if (access.state === "authorized") redirect(nextHref);
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
  if (mfa.state === "enrollment_required") redirect(`${mfa.destination}?next=${encodeURIComponent(nextHref)}`);
  return <MfaChallengeClient factorId={mfa.factorId} nextHref={nextHref} />;
}
