"use client";

import Link from "next/link";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { translate, type TranslationKey } from "@/app/i18n";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";

const questionNumbers = [1, 2, 3, 4, 5, 6, 7] as const;

export default function FaqClient() {
  const [language] = useLanguage();
  const t = (key: TranslationKey) => translate(language, key);

  return <main className="faq-shell">
    <PublicSiteHeader />
    <section className="faq-hero">
      <p>{t("faq.kicker")}</p>
      <h1>{t("faq.title")}</h1>
      <span>{t("faq.description")}</span>
    </section>
    <section className="faq-layout">
      <aside>
        <strong>{t("faq.help.title")}</strong>
        <p>{t("faq.help.description")}</p>
        <Link href="/contact?type=support">{t("faq.help.action")}</Link>
      </aside>
      <div className="faq-list">
        {questionNumbers.map((number, index) => {
          const question = t(`faq.q${number}.question` as TranslationKey);
          return <details key={number} open={index === 0}>
            <summary><span>{String(number).padStart(2, "0")}</span>{question}</summary>
            <p>{t(`faq.q${number}.answer` as TranslationKey)}</p>
          </details>;
        })}
      </div>
    </section>
    <footer className="faq-footer"><span>{brand.legalCopyright}</span><Link href="/">{t("faq.back")}</Link></footer>
  </main>;
}
