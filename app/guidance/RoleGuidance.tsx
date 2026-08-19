"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import type { Language } from "@/app/i18n";
import type { GuidanceRole } from "@/lib/dal/guidance";
import { dismissGuidanceAction } from "./actions";
import { guidanceFor, guidanceUi } from "./content";
import GuidanceTooltip from "./GuidanceTooltip";

export default function RoleGuidance({
  role,
  pathname,
  language,
  initiallyDismissed,
}: {
  role: GuidanceRole;
  pathname: string;
  language: Language;
  initiallyDismissed: boolean;
}) {
  const guide = guidanceFor(role, pathname, language);
  const ui = guidanceUi[language];
  const [introductionHidden, setIntroductionHidden] = useState(initiallyDismissed);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (!guide) return null;

  const dismiss = () => {
    setIntroductionHidden(true);
    startTransition(async () => {
      const result = await dismissGuidanceAction({ role, guideKey: guide.key, version: guide.version });
      if (!result.ok) setIntroductionHidden(false);
    });
  };

  return <>
    {!introductionHidden && <section className="role-guidance-introduction" aria-labelledby={`${guide.key}-title`}>
      <div className="role-guidance-mark" aria-hidden="true">i</div>
      <div>
        <p>{ui.eyebrow}</p>
        <h2 id={`${guide.key}-title`}>{guide.title}</h2>
        <span>{guide.purpose}</span>
      </div>
      <GuidanceTooltip label={ui.tooltip}>{guide.why}</GuidanceTooltip>
      <button type="button" className="role-guidance-open" onClick={() => setOpen(true)}>{ui.open}</button>
      <button type="button" className="role-guidance-dismiss" onClick={dismiss} disabled={pending} aria-label={ui.dismiss}>×</button>
    </section>}
    <button type="button" className="role-guidance-launcher" onClick={() => setOpen(true)} aria-haspopup="dialog"><span aria-hidden="true">?</span>{ui.help}</button>
    {open && <div className="role-guidance-backdrop" onMouseDown={(event) => { if (event.currentTarget === event.target) setOpen(false); }}>
      <aside className="role-guidance-drawer" role="dialog" aria-modal="true" aria-labelledby={`${guide.key}-dialog-title`}>
        <header><div><p>{ui.eyebrow}</p><h2 id={`${guide.key}-dialog-title`}>{guide.title}</h2></div><button ref={closeRef} type="button" onClick={() => setOpen(false)} aria-label={ui.close}>×</button></header>
        <p className="role-guidance-purpose">{guide.purpose}</p>
        <section><h3>{ui.why}</h3><p>{guide.why}</p></section>
        <section><h3>{ui.steps}</h3><ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
        <Link href={guide.href} onClick={() => setOpen(false)}>{guide.action}</Link>
      </aside>
    </div>}
  </>;
}
