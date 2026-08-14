import { notFound, redirect } from "next/navigation";
import { getAdminAccess, getAdminMfaDestination } from "@/lib/dal/admin-auth";
import { loadAdminDashboard, type AdminSection } from "@/lib/dal/admin";
import AdminAccessStatusScreen from "../AccessStatusScreen";
import AdminDashboard from "../AdminDashboardClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const sections = new Set<AdminSection>([
  "providers", "workshops", "customers", "managers", "sms", "support", "security",
]);

export default async function AdminSectionPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!sections.has(section as AdminSection)) notFound();

  const access = await getAdminAccess();
  if (access.state === "unauthenticated") redirect("/admin/login");
  if (access.state === "mfa_required") {
    const mfa = await getAdminMfaDestination();
    if (mfa.state === "security_error") return <AdminAccessStatusScreen status="securityError" />;
    redirect(mfa.destination);
  }
  if (access.state === "configuration") return <AdminAccessStatusScreen status="configuration" />;
  if (access.state === "unavailable") return <AdminAccessStatusScreen status="unavailable" />;
  if (access.state === "unauthorized" || access.state === "suspended") return <AdminAccessStatusScreen status={access.state} />;
  if (access.state !== "authorized") redirect("/admin/login");

  let data;
  try {
    data = await loadAdminDashboard(access.administrator);
  } catch {
    return <AdminAccessStatusScreen status="unavailable" />;
  }
  return <AdminDashboard data={data} section={section as AdminSection} />;
}
