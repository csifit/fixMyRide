"use client";

import Link from "next/link";
import { useActionState } from "react";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { platformLoginAction, type PlatformLoginState } from "./actions";

const initial: PlatformLoginState = { error: null };

export default function PlatformLoginForm({ portal, configured }: { portal: "customer" | "workshop_manager"; configured: boolean }) {
  const [language, setLanguage, ready] = useLanguage();
  const [state, action, pending] = useActionState(platformLoginAction, initial);
  const t = (key: TranslationKey) => translate(language, key);
  return <main className={`auth-shell ${ready ? "" : "i18n-pending"}`}><section className="auth-card">
    <header><Link className="auth-brand" href="/"><span>{brand.mark}</span>{brand.name}</Link><select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} aria-label={t("a11y.languageSelector")}><option value="en">EN</option><option value="de">DE</option><option value="ro">RO</option><option value="hu">HU</option></select></header>
    <div className="auth-intro"><span>{portal === "customer" ? "◆" : "⚙"}</span><h1>{t(`platformLogin.${portal}.title` as TranslationKey)}</h1><p>{t(`platformLogin.${portal}.description` as TranslationKey)}</p></div>
    {!configured ? <p className="auth-error">{t("auth.configuration.description")}</p> : <form action={action}><input type="hidden" name="portal" value={portal} /><label>{t("auth.login.email")}<input name="email" type="email" required autoComplete="email" /></label><label>{t("auth.login.password")}<input name="password" type="password" required minLength={8} autoComplete="current-password" /></label>{state.error && <p className="auth-error" role="alert">{t(state.error === "configuration" ? "auth.configuration.description" : `auth.login.${state.error}` as TranslationKey)}</p>}<button disabled={pending}>{t(pending ? "auth.login.submitting" : "auth.login.submit")}</button></form>}
    <small>{t("platformLogin.noAccount")} <Link href={portal === "customer" ? "/register/customer" : "/register/workshop-manager"}>{t("platformLogin.register")}</Link></small>
  </section></main>;
}
