import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";
import { getSidebarIdentity } from "@/lib/dal/sidebar-identity";

export default async function CustomerLayout({ children }: { children: ReactNode }) {
  const identity = await getSidebarIdentity();
  return <RoleWorkspaceShell role="customer" identity={identity}>{children}</RoleWorkspaceShell>;
}
