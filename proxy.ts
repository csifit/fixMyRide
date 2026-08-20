import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/workshop-manager/:path*",
    "/service-organisation/:path*",
    "/service-provider/:path*",
    "/workshop-staff/:path*",
    "/customer/:path*",
    "/auth/:path*",
    "/register/set-password",
    "/forgot-password",
    "/reset-password",
  ],
};
