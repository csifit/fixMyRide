"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { createClient } from "@/lib/supabase/client";
import { classifyAdminMfaDiscovery } from "@/lib/authz";
import { classifyMfaError, type MfaErrorKind } from "@/lib/auth-errors";
import { adminLogoutAction } from "../actions";
import PendingSubmitButton from "@/app/PendingSubmitButton";

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function MfaEnrollmentClient() {
  const [language, setLanguage, ready] = useLanguage();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<MfaErrorKind | null>(null);
  const [securityError, setSecurityError] = useState(false);
  const [pending, setPending] = useState(false);
  const requestInFlight = useRef(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = (key: TranslationKey) => translate(language, key);

  const beginEnrollment = async () => {
    if (requestInFlight.current) return;
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      const discovery = classifyAdminMfaDiscovery({
        lookupSucceeded: !factors.error,
        verifiedTotpCount: factors.data?.totp.length,
      });
      if (discovery === "security_error") {
        setSecurityError(true);
        return;
      }
      if (discovery === "challenge_required") {
        router.replace("/admin/mfa/challenge");
        router.refresh();
        return;
      }
      for (const factor of factors.data!.all) {
        if (factor.factor_type === "totp" && factor.status === "unverified") {
          const { error: removeError } = await supabase.auth.mfa.unenroll({
            factorId: factor.id,
          });
          if (removeError) {
            setSecurityError(true);
            return;
          }
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "VitaPass Superadmin",
      });
      if (enrollError) {
        setError(classifyMfaError(enrollError));
        return;
      }
      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
      requestInFlight.current = false;
    }
  };

  const verifyEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requestInFlight.current) return;
    if (!enrollment || !/^\d{6}$/.test(code)) {
      setError("invalid_code");
      return;
    }
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { error: verifyError } =
        await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code,
      });
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
        {securityError ? (
          <>
            <div className="auth-intro">
              <span>!</span>
              <h1>{t("admin.access.securityError.title")}</h1>
              <p>{t("admin.access.securityError.description")}</p>
            </div>
            <form action={adminLogoutAction}>
              <PendingSubmitButton type="submit">
                {t("auth.logout")}
              </PendingSubmitButton>
            </form>
          </>
        ) : (
          <>
        <div className="auth-intro">
          <span>2</span>
          <h1>{t("admin.mfa.enroll.title")}</h1>
          <p>{t("admin.mfa.enroll.description")}</p>
        </div>
        {!enrollment ? (
          <button
            className="auth-primary"
            type="button"
            disabled={pending}
            onClick={beginEnrollment}
          >
            {t(pending ? "admin.mfa.working" : "admin.mfa.enroll.start")}
          </button>
        ) : (
          <>
            <div className="mfa-qr">
              {/* The QR image and secret exist only in this enrollment session. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={enrollment.qrCode} alt={t("admin.mfa.qrAlt")} />
              <p>{t("admin.mfa.enroll.manual")}</p>
              <code>{enrollment.secret}</code>
            </div>
            <form onSubmit={verifyEnrollment}>
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
                    : "admin.mfa.enroll.verify",
                )}
              </button>
            </form>
          </>
        )}
        {error && !enrollment && (
          <p className="auth-error" role="alert">
            {t(`admin.mfa.${error}` as TranslationKey)}
          </p>
        )}
        <form action={adminLogoutAction} className="auth-secondary-form">
          <PendingSubmitButton type="submit">
            {t("auth.logout")}
          </PendingSubmitButton>
        </form>
          </>
        )}
      </section>
    </main>
  );
}
