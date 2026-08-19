import type { ReactNode } from "react";

export function CustomerPageGuide({ title, description, steps }: {
  title: string;
  description: string;
  steps: string[];
}) {
  return <aside className="customer-page-guide" aria-label={title}>
    <span aria-hidden="true">?</span>
    <div><h2>{title}</h2><p>{description}</p></div>
    <ol>{steps.map((step, index) => <li key={step}><b>{index + 1}</b><span>{step}</span></li>)}</ol>
  </aside>;
}

export function CustomerDecisionGuide({ title, description, choices }: {
  title: string;
  description: string;
  choices: Array<{ label: string; description: string }>;
}) {
  return <aside className="customer-decision-guide" aria-label={title}>
    <header><span aria-hidden="true">i</span><div><h4>{title}</h4><p>{description}</p></div></header>
    <dl>{choices.map((choice) => <div key={choice.label}><dt>{choice.label}</dt><dd>{choice.description}</dd></div>)}</dl>
  </aside>;
}

export function CustomerHint({ children }: { children: ReactNode }) {
  return <small className="customer-guidance-hint">{children}</small>;
}
