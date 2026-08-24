import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseEnvironment } from "../env";

export async function updateSession(request: NextRequest) {
  const environment = readSupabaseEnvironment();
  if (!environment.configured) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    environment.values.NEXT_PUBLIC_SUPABASE_URL,
    environment.values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([name, value]) =>
            response.headers.set(name, value),
          );
        },
      },
    },
  );

  const { data: claimsData } = await supabase.auth.getClaims();
  const pathname = request.nextUrl.pathname;
  const providerRoot = pathname === "/workshop-manager"
      || pathname.startsWith("/workshop-manager/")
    ? "/workshop-manager"
    : pathname === "/service-organisation"
      || pathname.startsWith("/service-organisation/")
      ? "/service-organisation"
      : null;
  const isProviderMfaChallenge = providerRoot
    ? pathname === `${providerRoot}/security/mfa`
    : false;
  const isProviderLogin = providerRoot
    ? pathname === `${providerRoot}/login`
    : false;

  if (providerRoot && claimsData?.claims?.sub
    && !isProviderMfaChallenge && !isProviderLogin) {
    const { data: assurance, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (!error && assurance.nextLevel === "aal2"
      && assurance.currentLevel !== "aal2") {
      const challenge = request.nextUrl.clone();
      challenge.pathname = `${providerRoot}/security/mfa`;
      challenge.search = "";
      challenge.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
      const redirect = NextResponse.redirect(challenge);
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
