"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { classifyMfaError, type MfaErrorKind } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export default function ProviderMfaChallengeClient({
  factorId,
  nextHref,
}: {
  factorId: string;
  nextHref: string;
}) {
  const [language, setLanguage, ready] = useLanguage();
  const [code, setCode] = useState("");
  const [error, setError] = useState<MfaErrorKind | null>(null);
  const [pending, setPending] = useState(false);
  const requestInFlight = useRef(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = (key: TranslationKey) => translate(language, key);

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requestInFlight.current || !/^\d{6}$/.test(code)) {
      setError("invalid_code");
      return;
    }
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) {
        setError(classifyMfaError(verifyError));
        return;
      }
      router.replace(nextHref);
      router.refresh();
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
      requestInFlight.current = false;
    }
  };

  return <main className={`provider-mfa-challenge ${ready ? "" : "i18n-pending"}`}>
    <section className="auth-card mfa-card">
      <header><strong>{t("providerSecurity.challengeBrand")}</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select></header>
      <div className="auth-intro"><span>2</span><h1>{t("providerSecurity.challengeTitle")}</h1><p>{t("providerSecurity.challengeDescription")}</p></div>
      <form onSubmit={verify}><label>{t("providerSecurity.currentCode")}<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" autoFocus required /></label>{error && <p className="auth-error" role="alert">{t(`providerSecurity.${error}` as TranslationKey)}</p>}<button disabled={pending}>{t(pending ? "providerSecurity.working" : "providerSecurity.challengeVerify")}</button></form>
      <form action={platformLogoutAction} className="auth-secondary-form"><button>{t("auth.logout")}</button></form>
    </section>
  </main>;
}
