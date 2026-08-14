"use client";

import Link from "next/link";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { useLanguage } from "@/app/i18n/useLanguage";
import { brand } from "@/lib/brand";
import { legalDocuments, type LegalDocumentType } from "./legal-content";

export default function LegalDocumentClient({ documentType }: { documentType: LegalDocumentType }) {
  const [language] = useLanguage();
  const document = legalDocuments[language][documentType];
  return <main className="legal-shell">
    <PublicSiteHeader />
    <section className="legal-hero"><p>{document.kicker}</p><h1>{document.title}</h1><span>{document.introduction}</span><time>{document.effectiveDate}</time></section>
    <section className="legal-layout">
      <aside><p>{document.contentsLabel}</p><nav>{document.sections.map((section, index) => <a key={section.id} href={`#${section.id}`}><span>{String(index + 1).padStart(2, "0")}</span>{section.title}</a>)}</nav></aside>
      <div className="legal-content">
        {document.sections.map((section) => <section id={section.id} key={section.id}><h2>{section.title}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}{section.items && <ul>{section.items.map((item) => <li key={item}>{item}</li>)}</ul>}</section>)}
        {documentType === "privacy" && <section className="legal-action-card"><h2>{document.closureTitle}</h2><p>{document.closureDescription}</p><Link href="/contact?type=account-closure">{document.closureAction}</Link></section>}
        <section className="legal-source-card"><h2>{document.sourcesTitle}</h2><div>{document.sources.map((source) => <a href={source.href} target="_blank" rel="noreferrer" key={source.href}>{source.label}</a>)}</div></section>
      </div>
    </section>
    <footer className="legal-footer"><span>© {new Date().getFullYear()} {brand.name}</span><nav><Link href="/terms">{document.footerTerms}</Link><Link href="/privacy">{document.footerPrivacy}</Link><Link href="/cookies">{document.footerCookies}</Link></nav></footer>
  </main>;
}

