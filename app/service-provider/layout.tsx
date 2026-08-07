import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";

export default function ServiceProviderLayout({ children }: { children: ReactNode }) {
  return <RoleWorkspaceShell role="service_provider">{children}</RoleWorkspaceShell>;
}
