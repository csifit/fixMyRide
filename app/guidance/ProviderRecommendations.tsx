"use client";

import Link from "next/link";
import { translate, type Language, type TranslationKey } from "@/app/i18n";
import type { ProviderRecommendation } from "@/lib/provider-recommendations";

const visibleLimit = 6;

function RecommendationCard({ recommendation, language }: { recommendation: ProviderRecommendation; language: Language }) {
  const t = (key: TranslationKey) => translate(language, key);
  return <article className={`priority-${recommendation.priority}`}>
    <header><span>{t(`suggestions.priority.${recommendation.priority}` as TranslationKey)}</span>{recommendation.locationName && <small>{recommendation.locationName}</small>}</header>
    <h3>{t(`suggestions.rule.${recommendation.rule}.title` as TranslationKey)}</h3>
    <p>{translate(language, `suggestions.rule.${recommendation.rule}.description` as TranslationKey, { count: recommendation.count, location: recommendation.locationName ?? t("suggestions.yourOrganisation") })}</p>
    <Link href={recommendation.href}>{t("suggestions.openAction")} <span aria-hidden="true">→</span></Link>
  </article>;
}

export default function ProviderRecommendations({ recommendations, language }: { recommendations: ProviderRecommendation[]; language: Language }) {
  const t = (key: TranslationKey) => translate(language, key);
  const visible = recommendations.slice(0, visibleLimit);
  const remaining = recommendations.slice(visibleLimit);
  return <section className="provider-recommendations" aria-labelledby="provider-recommendations-title">
    <header>
      <div><p>{t("suggestions.eyebrow")}</p><h2 id="provider-recommendations-title">{t("suggestions.title")}</h2><span>{t("suggestions.description")}</span></div>
      <span>{recommendations.length}</span>
    </header>
    {!visible.length ? <div className="provider-recommendations-clear"><span aria-hidden="true">✓</span><div><h3>{t("suggestions.clearTitle")}</h3><p>{t("suggestions.clearDescription")}</p></div></div> : <div className="provider-recommendation-list">
      {visible.map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} language={language} />)}
    </div>}
    {remaining.length > 0 && <details className="provider-recommendations-more"><summary>{translate(language, "suggestions.more", { count: remaining.length })}</summary><div className="provider-recommendation-list">{remaining.map((recommendation) => <RecommendationCard key={recommendation.id} recommendation={recommendation} language={language} />)}</div></details>}
  </section>;
}
