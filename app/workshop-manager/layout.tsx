import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";
import { getSidebarIdentity } from "@/lib/dal/sidebar-identity";

export default async function WorkshopManagerLayout({ children }: { children: ReactNode }) {
  const identity = await getSidebarIdentity();
  return <RoleWorkspaceShell role="workshop_manager" identity={identity}>{children}</RoleWorkspaceShell>;
}
