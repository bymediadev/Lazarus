import MetricGlossary from "./MetricGlossary";
import { driTagClass, type ProprietaryIndices } from "../types";

interface Props {
  indices: ProprietaryIndices;
}

function MetricCard({
  label,
  value,
  detail,
  accentClass,
}: {
  label: string;
  value: string | number;
  detail: string;
  accentClass?: string;
}) {
  return (
    <div className={`deal-metric-card ${accentClass ?? ""}`.trim()}>
      <span className="deal-metric-label">{label}</span>
      <span className="deal-metric-value">{value}</span>
      <div className="deal-metric-details">
        <span className="view-details-hint">View Details</span>
        <p className="deal-metric-detail-text">{detail}</p>
      </div>
    </div>
  );
}

export default function DealHeaderMetrics({ indices: pi }: Props) {
  const driClass = driTagClass(pi.risk_tier);

  return (
    <section className="deal-header-metrics" aria-label="Primary deal metrics">
      <div className="deal-header-metrics-top">
        <h2 className="deal-header-metrics-title">Deal header metrics</h2>
        <MetricGlossary variant="icon" />
      </div>
      <div className={`dri-banner deal-header-dri ${driClass}`}>
        <span className="dri-label">Deal Risk Score</span>
        <span className="dri-score">{pi.deal_risk_index}</span>
        <span className="dri-tier">{pi.risk_tier} RISK</span>
      </div>
      <div className="deal-metric-grid">
        <MetricCard
          label="Deal Risk Score"
          value={pi.deal_risk_index}
          detail="1–100 macro-rating of stall / drop likelihood from missed milestones."
          accentClass={driClass}
        />
        <MetricCard
          label="Department Friction (DFI)"
          value={pi.multi_department_friction}
          detail="Pushback or misalignment from Legal, Security, IT, and peer departments."
        />
        <MetricCard
          label="Dispersion"
          value={pi.stakeholder_dispersion_index}
          detail="How fragmented buyer communication is across stakeholders."
        />
        <MetricCard
          label="Stall signals"
          value={pi.dialogue_stall_score}
          detail={
            pi.authority_gap_flag
              ? "Dialogue stall pressure with an authority-gap flag raised."
              : "Dialogue stall pressure from missed cadence and unresolved objections."
          }
        />
      </div>
    </section>
  );
}
