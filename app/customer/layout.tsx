import type { ReactNode } from "react";
import RoleWorkspaceShell from "@/app/RoleWorkspaceShell";

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <RoleWorkspaceShell role="customer">{children}</RoleWorkspaceShell>;
}
