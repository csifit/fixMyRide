import type { ReactNode } from "react";

export function OperationalIntroduction({ title, description, outcomeLabel, outcome, stepsLabel, steps }: {
  title: string;
  description: string;
  outcomeLabel: string;
  outcome: string;
  stepsLabel: string;
  steps: string[];
}) {
  return <aside className="operational-introduction" aria-label={title}>
    <header><span aria-hidden="true">i</span><div><h2>{title}</h2><p>{description}</p></div></header>
    <div className="operational-introduction-body">
      <section><h3>{outcomeLabel}</h3><p>{outcome}</p></section>
      <section><h3>{stepsLabel}</h3><ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol></section>
    </div>
  </aside>;
}

export function FieldHelp({ children, id }: { children: ReactNode; id?: string }) {
  return <small className="operational-field-help" id={id}>{children}</small>;
}

export function OperationalEmptyState({ mark, title, description, action }: {
  mark: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return <div className="operational-empty-state">
    <span aria-hidden="true">{mark}</span>
    <div><h3>{title}</h3><p>{description}</p></div>
    {action && <div className="operational-empty-action">{action}</div>}
  </div>;
}
