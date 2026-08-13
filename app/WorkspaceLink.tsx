"use client";

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

const serviceOrganisationRoutes: Record<string, string> = {
  "/workshop-manager": "/service-organisation",
  "/workshop-manager/requests": "/service-organisation/requests",
  "/workshop-manager/repairs": "/service-organisation/repairs",
  "/workshop-manager/quality": "/service-organisation/quality",
  "/workshop-manager/workshops": "/service-organisation/locations",
  "/workshop-manager/services": "/service-organisation/services",
  "/workshop-manager/inventory": "/service-organisation/inventory",
};

export default function WorkspaceLink({ href, ...props }: ComponentProps<typeof NextLink>) {
  const pathname = usePathname();
  const resolvedHref = pathname.startsWith("/service-organisation")
    && typeof href === "string"
    ? serviceOrganisationRoutes[href] ?? href
    : href;
  return <NextLink href={resolvedHref} {...props} />;
}
