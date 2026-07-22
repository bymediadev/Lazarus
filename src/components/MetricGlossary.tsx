import { useEffect, useId, useRef, useState } from "react";
import { METRIC_LEGEND } from "../lib/metricLegend";

/** @deprecated Prefer METRIC_LEGEND — kept as alias for existing imports. */
export const METRIC_GLOSSARY = METRIC_LEGEND;

interface Props {
  /** Compact floating control for the deal header; panel = intake-side legend. */
  variant?: "icon" | "panel";
}

export default function MetricGlossary({ variant = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const list = (
    <dl className="metric-glossary-list">
      {METRIC_LEGEND.map((entry) => (
        <div key={entry.id} className="metric-glossary-item">
          <dt>{entry.term}</dt>
          <dd>
            {entry.definition}
            <span className="metric-glossary-map">In the report: {entry.reportMapsTo}</span>
          </dd>
        </div>
      ))}
    </dl>
  );

  if (variant === "panel") {
    return (
      <aside className="metric-glossary-panel metric-legend-intake" aria-label="Metric legend">
        <h3 className="metric-glossary-heading">Metric legend</h3>
        <p className="metric-glossary-lede">
          Terms Lazarus scores from the transcript — and where they show up in the report.
        </p>
        {list}
      </aside>
    );
  }

  return (
    <div className="metric-glossary" ref={rootRef}>
      <button
        type="button"
        className="metric-glossary-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Open metric glossary"
        title="Metric glossary"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <div id={panelId} className="metric-glossary-popover" role="dialog" aria-label="Metric glossary">
          <div className="metric-glossary-popover-header">
            <strong>Metric glossary</strong>
            <button type="button" className="metric-glossary-close" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          {list}
        </div>
      )}
    </div>
  );
}
