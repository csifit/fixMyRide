import Link from "next/link";
import PublicSiteHeader from "@/app/PublicSiteHeader";
import { brand } from "@/lib/brand";

export type GuideSection = {
  id: string;
  title: string;
  introduction: string;
  benefits?: { title: string; description: string }[];
  steps?: { title: string; description: string; link?: { href: string; label: string } }[];
  note?: string;
};

export default function PlatformGuide({
  audience,
  title,
  introduction,
  sections,
  action,
}: {
  audience: string;
  title: string;
  introduction: string;
  sections: GuideSection[];
  action: { href: string; label: string };
}) {
  return <main className="platform-guide-page">
    <PublicSiteHeader />
    <header className="platform-guide-hero">
      <p>{audience} guide</p>
      <h1>{title}</h1>
      <span>{introduction}</span>
      <Link href={action.href}>{action.label}</Link>
    </header>

    <div className="platform-guide-layout">
      <aside className="platform-guide-sidebar">
        <strong>In this guide</strong>
        <nav aria-label={`${audience} guide sections`}>
          {sections.map((section, index) => <a href={`#${section.id}`} key={section.id}>
            <span>{String(index + 1).padStart(2, "0")}</span>{section.title}
          </a>)}
        </nav>
        <p>Need help?</p>
        <a className="platform-guide-support" href={`mailto:${brand.supportEmail}`}>Contact support</a>
      </aside>

      <article className="platform-guide-content">
        {sections.map((section, sectionIndex) => <section id={section.id} key={section.id}>
          <header>
            <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
            <div><h2>{section.title}</h2><p>{section.introduction}</p></div>
          </header>
          {section.benefits && <div className="platform-guide-benefits">
            {section.benefits.map((benefit) => <div key={benefit.title}>
              <strong>{benefit.title}</strong><p>{benefit.description}</p>
            </div>)}
          </div>}
          {section.steps && <ol className="platform-guide-steps">
            {section.steps.map((step) => <li key={step.title}>
              <div><strong>{step.title}</strong><p>{step.description}{step.link && <> <Link href={step.link.href}>{step.link.label}</Link></>}</p></div>
            </li>)}
          </ol>}
          {section.note && <p className="platform-guide-note">{section.note}</p>}
        </section>)}
      </article>
    </div>

    <footer className="platform-guide-footer">
      <span>{brand.legalCopyright}</span>
      <Link href="/">Back to the home page</Link>
    </footer>
  </main>;
}
