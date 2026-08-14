"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLanguage } from "@/app/i18n/useLanguage";
import { privacyNoticeCopy } from "@/app/legal/legal-content";

const acknowledgementKey = "pitster.privacy-notice.2026-08";

export default function PrivacyNoticeModal() {
  const [language] = useLanguage();
  const [visible, setVisible] = useState(false);
  const copy = privacyNoticeCopy[language];

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setVisible(localStorage.getItem(acknowledgementKey) !== "understood");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  function acknowledge() {
    localStorage.setItem(acknowledgementKey, "understood");
    setVisible(false);
  }

  if (!visible) return null;
  return <div className="privacy-notice-backdrop" role="presentation">
    <section className="privacy-notice-modal" role="dialog" aria-modal="true" aria-labelledby="privacy-notice-title">
      <header><span aria-hidden="true">i</span><h2 id="privacy-notice-title">{copy.title}</h2></header>
      {copy.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      <nav><Link href="/privacy">{copy.privacyLink}</Link><Link href="/cookies">{copy.cookiesLink}</Link></nav>
      <button type="button" onClick={acknowledge} autoFocus>{copy.action}</button>
    </section>
  </div>;
}

