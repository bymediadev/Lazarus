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
      <p className="deal-metric-detail-text">{detail}</p>
    </div>
  );
}

export default function DealHeaderMetrics({ indices: pi }: Props) {
  const driClass = driTagClass(pi.risk_tier);

  return (
    <section className="deal-header-metrics" aria-label="Primary deal metrics">
      <div className="deal-header-metrics-top">
        <h2 className="deal-header-metrics-title">Forecast snapshot</h2>
        <MetricGlossary variant="icon" />
      </div>
      <div className="deal-metric-grid">
        <MetricCard
          label="Deal Risk Score"
          value={pi.deal_risk_index}
          detail="Likelihood this deal stalls or drops (1–100)."
          accentClass={driClass}
        />
        <MetricCard
          label="Dept friction (DFI)"
          value={pi.multi_department_friction}
          detail="Pushback from Legal, Security, IT, and peers."
        />
        <MetricCard
          label="Dispersion"
          value={pi.stakeholder_dispersion_index}
          detail="How fragmented buyer communication is."
        />
        <MetricCard
          label="Stall signals"
          value={pi.dialogue_stall_score}
          detail={
            pi.authority_gap_flag
              ? "Stall pressure — authority gap flagged."
              : "Stall pressure from missed cadence and open objections."
          }
        />
      </div>
    </section>
  );
}
