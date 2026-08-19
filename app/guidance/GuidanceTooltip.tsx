export default function GuidanceTooltip({ label, children }: { label: string; children: string }) {
  return <details className="guidance-tooltip">
    <summary aria-label={label}>?</summary>
    <span role="tooltip">{children}</span>
  </details>;
}
