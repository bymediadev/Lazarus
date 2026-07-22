import { useEffect, useId, useRef, useState } from "react";

export const METRIC_GLOSSARY = [
  {
    id: "deal-risk-score",
    term: "Deal Risk Score",
    definition:
      "A 1–100 macro-rating predicting the likelihood of a deal stalling out or dropping based on historically missed milestones.",
  },
  {
    id: "dfi",
    term: "Department Friction Index (DFI)",
    definition:
      "A gauge measuring the pushback, skepticism, or lack of alignment detected from specific internal departments (e.g., Legal, Security, IT).",
  },
  {
    id: "dispersion",
    term: "Dispersion",
    definition:
      "A metric calculating how fragmented the buyer's communication is. High dispersion means too many disconnected stakeholders; low dispersion means a unified decision-making front.",
  },
] as const;

interface Props {
  /** Compact floating control for the deal header; defaults to panel legend. */
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

  if (variant === "panel") {
    return (
      <aside className="metric-glossary-panel" aria-label="Metric glossary">
        <h3 className="metric-glossary-heading">Metric legend</h3>
        <dl className="metric-glossary-list">
          {METRIC_GLOSSARY.map((entry) => (
            <div key={entry.id} className="metric-glossary-item">
              <dt>{entry.term}</dt>
              <dd>{entry.definition}</dd>
            </div>
          ))}
        </dl>
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
          <dl className="metric-glossary-list">
            {METRIC_GLOSSARY.map((entry) => (
              <div key={entry.id} className="metric-glossary-item">
                <dt>{entry.term}</dt>
                <dd>{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
