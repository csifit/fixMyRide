import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";
import WorkshopManagerDashboard from "./WorkshopManagerDashboard";

export const dynamic = "force-dynamic";

export default async function WorkshopManagerPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") return <main className="registration-shell"><section className="registration-card"><h1>Workshop manager access</h1><p>Your account is currently {access.state}. Contact platform support if this is unexpected.</p></section></main>;
  const providers = await loadManagedServiceProviders(access.manager.id);
  return <WorkshopManagerDashboard displayName={access.manager.displayName} providers={providers} logoutAction={platformLogoutAction} />;
}
