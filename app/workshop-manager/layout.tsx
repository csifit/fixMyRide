import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";

export default function WorkshopManagerLayout({ children }: { children: ReactNode }) {
  return <RoleWorkspaceShell role="workshop_manager">{children}</RoleWorkspaceShell>;
}
