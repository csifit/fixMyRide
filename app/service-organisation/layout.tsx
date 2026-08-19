import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";
import { getSidebarIdentity } from "@/lib/dal/sidebar-identity";
import { loadMyDismissedGuides } from "@/lib/dal/guidance";

export default async function ServiceOrganisationLayout({ children }: { children: ReactNode }) {
  const [identity, dismissedGuides] = await Promise.all([
    getSidebarIdentity(),
    loadMyDismissedGuides("service_organisation").catch(() => []),
  ]);
  return <RoleWorkspaceShell role="service_organisation" identity={identity} dismissedGuides={dismissedGuides}>{children}</RoleWorkspaceShell>;
}
