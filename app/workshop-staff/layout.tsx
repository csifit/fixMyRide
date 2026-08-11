import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";
import { getSidebarIdentity } from "@/lib/dal/sidebar-identity";

export default async function WorkshopStaffLayout({ children }: { children: ReactNode }) {
  const identity = await getSidebarIdentity();
  return <RoleWorkspaceShell role="workshop_staff" identity={identity}>{children}</RoleWorkspaceShell>;
}
