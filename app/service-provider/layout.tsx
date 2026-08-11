import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";
import { getSidebarIdentity } from "@/lib/dal/sidebar-identity";

export default async function ServiceProviderLayout({ children }: { children: ReactNode }) {
  const identity = await getSidebarIdentity();
  return <RoleWorkspaceShell role="service_provider" identity={identity}>{children}</RoleWorkspaceShell>;
}
