import { createClient } from "@/lib/supabase/server";
import SetPasswordClient from "./SetPasswordClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();
  const { data, error: claimsError } = await supabase.auth.getClaims();
  const authenticated = !claimsError && Boolean(data?.claims?.sub);

  return (
    <SetPasswordClient
      authenticated={authenticated}
      invalidLink={error === "invalid_link"}
    />
  );
}
