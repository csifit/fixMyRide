import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";

export default function WorkshopStaffLayout({ children }: { children: ReactNode }) {
  return <RoleWorkspaceShell role="workshop_staff">{children}</RoleWorkspaceShell>;
}
