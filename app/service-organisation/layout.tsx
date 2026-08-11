import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";
import { getSidebarIdentity } from "@/lib/dal/sidebar-identity";

export default async function ServiceOrganisationLayout({ children }: { children: ReactNode }) {
  const identity = await getSidebarIdentity();
  return <RoleWorkspaceShell role="service_organisation" identity={identity}>{children}</RoleWorkspaceShell>;
}
