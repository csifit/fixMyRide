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
    "/staff/:path*",
    "/patient/:path*",
    "/auth/:path*",
    "/register/set-password",
  ],
};
