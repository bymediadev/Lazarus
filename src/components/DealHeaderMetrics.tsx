import MetricGlossary from "./MetricGlossary";
import { formatScoreOutOf100 } from "../lib/metricLegend";
import { driTagClass, type ProprietaryIndices, type PostMortemResult } from "../types";

interface Props {
  indices: ProprietaryIndices;
  viabilityScore?: number;
}

function MetricCard({
  label,
  value,
  detail,
  accentClass,
}: {
  label: string;
  value: string;
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

export default function DealHeaderMetrics({ indices: pi, viabilityScore }: Props) {
  const driClass = driTagClass(pi.risk_tier);
  const legendScores = {
    deal_risk_index: pi.deal_risk_index,
    multi_department_friction: pi.multi_department_friction,
    stakeholder_dispersion_index: pi.stakeholder_dispersion_index,
    dialogue_stall_score: pi.dialogue_stall_score,
    viability_score: viabilityScore,
  };

  return (
    <section className="deal-header-metrics" aria-label="Primary deal metrics">
      <div className="deal-header-metrics-top">
        <h2 className="deal-header-metrics-title">Forecast snapshot</h2>
        <MetricGlossary variant="icon" scores={legendScores} />
      </div>
      <div className="deal-metric-grid deal-metric-grid-five">
        <MetricCard
          label="Deal Risk Score"
          value={formatScoreOutOf100(pi.deal_risk_index)}
          detail="Likelihood this deal stalls or drops."
          accentClass={driClass}
        />
        <MetricCard
          label="Dept friction (DFI)"
          value={formatScoreOutOf100(pi.multi_department_friction)}
          detail="Pushback from Legal, Security, IT, and peers."
        />
        <MetricCard
          label="Dispersion"
          value={formatScoreOutOf100(pi.stakeholder_dispersion_index)}
          detail="How fragmented buyer communication is."
        />
        <MetricCard
          label="Stall signals"
          value={formatScoreOutOf100(pi.dialogue_stall_score)}
          detail={
            pi.authority_gap_flag
              ? "Stall pressure — authority gap flagged."
              : "Stall pressure from missed cadence and open objections."
          }
        />
        <MetricCard
          label="Recoverability"
          value={formatScoreOutOf100(viabilityScore)}
          detail="Higher = still worth manager effort; lower = flat no risk."
        />
      </div>
    </section>
  );
}

/** Helper for callers that have a full result. */
export function legendScoresFromResult(result: PostMortemResult) {
  const pi = result.proprietary_indices;
  return {
    deal_risk_index: pi?.deal_risk_index,
    multi_department_friction: pi?.multi_department_friction,
    stakeholder_dispersion_index: pi?.stakeholder_dispersion_index,
    dialogue_stall_score: pi?.dialogue_stall_score,
    viability_score: result.viability_state?.viability_score,
  };
}
