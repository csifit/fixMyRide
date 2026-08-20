import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type");
  const code = request.nextUrl.searchParams.get("code");
  const recovery = type === "recovery"
    || request.nextUrl.searchParams.get("flow") === "recovery";
  const rawPortal = request.nextUrl.searchParams.get("portal");
  const portal = ["customer", "workshop_manager", "service_organisation", "admin"]
    .includes(rawPortal ?? "") ? rawPortal! : "customer";
  const destination = request.nextUrl.clone();
  destination.pathname = recovery ? "/reset-password" : "/register/set-password";
  destination.search = "";

  if (recovery) destination.searchParams.set("portal", portal);

  if (tokenHash && (type === "email" || type === "recovery")) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (!error) return NextResponse.redirect(destination);
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(destination);
  }

  destination.searchParams.set("error", "invalid_link");
  return NextResponse.redirect(destination);
}
