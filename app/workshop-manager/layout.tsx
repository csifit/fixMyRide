import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";
import { getSidebarIdentity } from "@/lib/dal/sidebar-identity";
import { loadMyDismissedGuides } from "@/lib/dal/guidance";

export default async function WorkshopManagerLayout({ children }: { children: ReactNode }) {
  const [identity, dismissedGuides] = await Promise.all([
    getSidebarIdentity(),
    loadMyDismissedGuides("workshop_manager").catch(() => []),
  ]);
  return <RoleWorkspaceShell role="workshop_manager" identity={identity} dismissedGuides={dismissedGuides}>{children}</RoleWorkspaceShell>;
}
