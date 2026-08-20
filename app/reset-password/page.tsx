import { normalizeRecoveryPortal } from "@/app/authentication/recovery";
import { createClient } from "@/lib/supabase/server";
import ResetPasswordClient from "./ResetPasswordClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; portal?: string }>;
}) {
  const { error, portal: rawPortal } = await searchParams;
  let authenticated = false;
  try {
    const supabase = await createClient();
    const { data, error: claimsError } = await supabase.auth.getClaims();
    authenticated = !claimsError && Boolean(data?.claims?.sub);
  } catch {
    authenticated = false;
  }

  return (
    <ResetPasswordClient
      authenticated={authenticated}
      invalidLink={error === "invalid_link"}
      portal={normalizeRecoveryPortal(rawPortal)}
    />
  );
}
