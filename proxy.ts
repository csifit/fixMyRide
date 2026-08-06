import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/doctor/:path*",
    "/admin/:path*",
    "/clinic-manager/:path*",
    "/workshop-manager/:path*",
    "/service-provider/:path*",
    "/workshop-staff/:path*",
    "/staff/:path*",
    "/patient/:path*",
    "/customer/:path*",
    "/auth/:path*",
    "/register/set-password",
  ],
};
