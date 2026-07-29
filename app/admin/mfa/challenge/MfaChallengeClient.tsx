"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { createClient } from "@/lib/supabase/client";
import { classifyMfaError, type MfaErrorKind } from "@/lib/auth-errors";
import { adminLogoutAction } from "../../actions";
import PendingSubmitButton from "@/app/PendingSubmitButton";

export default function MfaChallengeClient({ factorId }: { factorId: string }) {
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
    if (requestInFlight.current) return;
    if (!/^\d{6}$/.test(code)) {
      setError("invalid_code");
      return;
    }
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { error: verifyError } =
        await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (verifyError) {
        setError(classifyMfaError(verifyError));
        return;
      }
      router.replace("/admin");
      router.refresh();
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
      requestInFlight.current = false;
    }
  };

  return (
    <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}>
      <section className="auth-card mfa-card">
        <header>
          <strong>{t("admin.mfa.brand")}</strong>
          <label className="language">
            <span aria-hidden="true">◎</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value as typeof language)
              }
              aria-label={t("a11y.languageSelector")}
            >
              <option value="en">{t("language.en")}</option>
              <option value="de">{t("language.de")}</option>
              <option value="ro">{t("language.ro")}</option>
              <option value="hu">{t("language.hu")}</option>
            </select>
          </label>
        </header>
        <div className="auth-intro">
          <span>2</span>
          <h1>{t("admin.mfa.challenge.title")}</h1>
          <p>{t("admin.mfa.challenge.description")}</p>
        </div>
        <form onSubmit={verify}>
          <label>
            {t("admin.mfa.code")}
            <input
              value={code}
              onChange={(event) =>
                setCode(event.target.value.replace(/\D/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              autoFocus
              required
            />
          </label>
          {error && (
            <p className="auth-error" role="alert">
              {t(`admin.mfa.${error}` as TranslationKey)}
            </p>
          )}
          <button type="submit" disabled={pending}>
            {t(
              pending
                ? "admin.mfa.working"
                : "admin.mfa.challenge.verify",
            )}
          </button>
        </form>
        <form action={adminLogoutAction} className="auth-secondary-form">
          <PendingSubmitButton type="submit">
            {t("auth.logout")}
          </PendingSubmitButton>
        </form>
      </section>
    </main>
  );
}
