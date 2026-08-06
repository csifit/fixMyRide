import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkshopManagerAccess } from "@/lib/dal/platform-access";

export const dynamic = "force-dynamic";

export default async function ServiceProviderInvoicingPage() {
  const access = await getWorkshopManagerAccess();
  if (access.state === "unauthenticated") redirect("/workshop-manager/login");
  if (access.state !== "active") redirect("/workshop-manager");
  return <main className="settings-shell"><header className="settings-topbar"><Link href="/workshop-manager">← Dashboard</Link><strong>fixMyRide</strong></header><section className="settings-content"><p className="registration-kicker">Service provider billing</p><h1>Invoicing</h1><p>The automotive subscription and invoicing workspace is scheduled for the commercial conversion milestone. Existing billing records remain preserved during the cutover.</p></section></main>;
}
