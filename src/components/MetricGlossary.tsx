import { useEffect, useId, useRef, useState } from "react";
import {
  METRIC_LEGEND,
  formatScoreOutOf100,
  resolveLegendScore,
  type LegendScoreSource,
} from "../lib/metricLegend";

/** @deprecated Prefer METRIC_LEGEND — kept as alias for existing imports. */
export const METRIC_GLOSSARY = METRIC_LEGEND;

interface Props {
  /** Compact floating control for the deal header; panel = intake-side legend. */
  variant?: "icon" | "panel";
  /** Live scores from a completed report (optional on intake). */
  scores?: LegendScoreSource | null;
}

export default function MetricGlossary({ variant = "icon", scores }: Props) {
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
      {METRIC_LEGEND.map((entry) => {
        const score = resolveLegendScore(entry, scores);
        return (
          <div key={entry.id} className="metric-glossary-item">
            <dt>
              {entry.term}
              {score != null && (
                <span className="metric-glossary-score">{formatScoreOutOf100(score)}</span>
              )}
            </dt>
            <dd>
              {entry.definition}
              <span className="metric-glossary-map">In the report: {entry.reportMapsTo}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );

  if (variant === "panel") {
    return (
      <aside className="metric-glossary-panel metric-legend-intake" aria-label="Metric legend">
        <h3 className="metric-glossary-heading">Metric legend</h3>
        <p className="metric-glossary-lede">
          Terms Lazarus Deal Recovery scores from 0–100 — and where they show up in the report.
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
