import { normalizeRecoveryPortal } from "@/app/authentication/recovery";
import { readSupabaseEnvironment } from "@/lib/env";
import ForgotPasswordClient from "./ForgotPasswordClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ portal?: string }>;
}) {
  const { portal } = await searchParams;
  return (
    <ForgotPasswordClient
      configured={readSupabaseEnvironment().configured}
      portal={normalizeRecoveryPortal(portal)}
    />
  );
}
