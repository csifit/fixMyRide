import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";

export default function ServiceOrganisationLayout({ children }: { children: ReactNode }) {
  return <RoleWorkspaceShell role="service_organisation">{children}</RoleWorkspaceShell>;
}
