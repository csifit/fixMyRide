"use client";

import Link from "@/app/WorkspaceLink";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { platformLogoutAction } from "@/app/authentication/actions";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { classifyMfaError, type MfaErrorKind } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";

export type ProviderSecurityRole = "workshop_manager" | "service_organisation";
type Enrollment = { factorId: string; qrCode: string; secret: string };

export default function ProviderSecurityClient({
  role,
  factor,
  unavailable,
}: {
  role: ProviderSecurityRole;
  factor: { id: string; friendlyName: string | null } | null;
  unavailable: boolean;
}) {
  const root = role === "service_organisation" ? "/service-organisation" : "/workshop-manager";
  const [language, setLanguage, ready] = useLanguage();
  const [activeFactor, setActiveFactor] = useState(factor);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [removeCode, setRemoveCode] = useState("");
  const [error, setError] = useState<MfaErrorKind | null>(null);
  const [notice, setNotice] = useState<"enabled" | "disabled" | null>(null);
  const [pending, setPending] = useState(false);
  const requestInFlight = useRef(false);
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const t = (key: TranslationKey) => translate(language, key);

  const beginEnrollment = async () => {
    if (requestInFlight.current || unavailable) return;
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setError("unavailable");
        return;
      }
      const verified = factors.data.totp[0];
      if (verified) {
        setActiveFactor({ id: verified.id, friendlyName: verified.friendly_name ?? null });
        router.refresh();
        return;
      }
      for (const candidate of factors.data.all) {
        if (candidate.factor_type === "totp" && candidate.status === "unverified") {
          const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: candidate.id });
          if (removeError) {
            setError("unavailable");
            return;
          }
        }
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: role === "service_organisation"
          ? "pitster service organisation"
          : "pitster workshop manager",
        issuer: "pitster",
      });
      if (enrollError) {
        setError(classifyMfaError(enrollError));
        return;
      }
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
      requestInFlight.current = false;
    }
  };

  const verifyEnrollment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requestInFlight.current || !enrollment || !/^\d{6}$/.test(code)) {
      setError("invalid_code");
      return;
    }
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: enrollment.factorId,
        code,
      });
      if (verifyError) {
        setError(classifyMfaError(verifyError));
        return;
      }
      setActiveFactor({ id: enrollment.factorId, friendlyName: null });
      setEnrollment(null);
      setCode("");
      setNotice("enabled");
      router.refresh();
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
      requestInFlight.current = false;
    }
  };

  const disableMfa = async (event: React.FormEvent) => {
    event.preventDefault();
    if (requestInFlight.current || !activeFactor || !/^\d{6}$/.test(removeCode)) {
      setError("invalid_code");
      return;
    }
    requestInFlight.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
        factorId: activeFactor.id,
        code: removeCode,
      });
      if (verifyError) {
        setError(classifyMfaError(verifyError));
        return;
      }
      const { error: removeError } = await supabase.auth.mfa.unenroll({ factorId: activeFactor.id });
      if (removeError) {
        setError(classifyMfaError(removeError));
        return;
      }
      await supabase.auth.refreshSession();
      setActiveFactor(null);
      setRemoveCode("");
      setNotice("disabled");
      router.refresh();
    } catch {
      setError("unavailable");
    } finally {
      setPending(false);
      requestInFlight.current = false;
    }
  };

  if (!ready) return <main className="registration-shell" aria-busy="true" />;
  return <main className="settings-shell provider-security-shell">
    <header className="settings-topbar"><Link href={root}>← {t("workspace.back")}</Link><strong>pitster</strong><select value={language} onChange={(event) => setLanguage(event.target.value as Language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select><form action={platformLogoutAction}><button>{t("auth.logout")}</button></form></header>
    <section className="settings-content provider-security-content">
      <p className="registration-kicker">{t("providerSecurity.eyebrow")}</p>
      <h1>{t("providerSecurity.title")}</h1>
      <p>{t("providerSecurity.description")}</p>
      <section className={`provider-security-status${activeFactor ? " enabled" : ""}`}>
        <span aria-hidden="true">{activeFactor ? "✓" : "2"}</span>
        <div><h2>{t(activeFactor ? "providerSecurity.enabledTitle" : "providerSecurity.optionalTitle")}</h2><p>{t(activeFactor ? "providerSecurity.enabledDescription" : "providerSecurity.optionalDescription")}</p></div>
        <em>{t(activeFactor ? "providerSecurity.statusEnabled" : "providerSecurity.statusDisabled")}</em>
      </section>
      {unavailable ? <p className="note-error" role="alert">{t("providerSecurity.unavailable")}</p> : activeFactor ? <section className="provider-security-action danger-zone">
        <h2>{t("providerSecurity.disableTitle")}</h2>
        <p>{t("providerSecurity.disableDescription")}</p>
        <form onSubmit={disableMfa}>
          <label>{t("providerSecurity.currentCode")}<input value={removeCode} onChange={(event) => setRemoveCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label>
          <button disabled={pending}>{t(pending ? "providerSecurity.working" : "providerSecurity.disable")}</button>
        </form>
      </section> : <section className="provider-security-action">
        <h2>{t("providerSecurity.enableTitle")}</h2>
        <p>{t("providerSecurity.enableDescription")}</p>
        {!enrollment ? <button type="button" disabled={pending} onClick={beginEnrollment}>{t(pending ? "providerSecurity.working" : "providerSecurity.start")}</button> : <div className="provider-mfa-enrollment">
          <div className="mfa-qr">
            {/* Supabase returns a data URL that exists only during this enrollment. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enrollment.qrCode} alt={t("providerSecurity.qrAlt")} />
            <p>{t("providerSecurity.manual")}</p><code>{enrollment.secret}</code>
          </div>
          <form onSubmit={verifyEnrollment}><label>{t("providerSecurity.currentCode")}<input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required /></label><button disabled={pending}>{t(pending ? "providerSecurity.working" : "providerSecurity.verify")}</button></form>
        </div>}
      </section>}
      {error && <p className="note-error" role="alert">{t(`providerSecurity.${error}` as TranslationKey)}</p>}
      {notice && <p className="note-success" role="status">{t(`providerSecurity.${notice}` as TranslationKey)}</p>}
      <aside className="provider-security-recovery"><h2>{t("providerSecurity.recoveryTitle")}</h2><p>{t("providerSecurity.recoveryDescription")}</p></aside>
    </section>
  </main>;
}
