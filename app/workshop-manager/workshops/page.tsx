import Link from "next/link";
import { redirect } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";
import { loadManagedServiceProviders } from "@/lib/dal/service-providers";

export const dynamic = "force-dynamic";

export default async function ManagedWorkshopsPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  const providers = await loadManagedServiceProviders(access.manager.id);
  return <main className="settings-shell"><header className="settings-topbar"><Link href="/workshop-manager">← Dashboard</Link><strong>fixMyRide</strong><form action={platformLogoutAction}><button>Sign out</button></form></header><section className="settings-content"><p className="registration-kicker">Workshop management</p><h1>Workshops</h1><p>Review the workshops attached to your service provider account. Hours, closures, capacity, and public-profile editing arrive in the next milestone.</p><div className="settings-accordions">{providers.flatMap((provider) => provider.workshops.map((workshop) => <article className="organization-card" key={workshop.id}><h2>{workshop.displayName}</h2><p>{workshop.city || provider.countryCode} · {provider.displayName}</p><b>{workshop.status}</b></article>))}</div></section></main>;
}
