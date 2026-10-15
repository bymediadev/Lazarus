import MetricGlossary from "./MetricGlossary";
import { formatScoreOutOf100 } from "../lib/metricLegend";
import { formatRecoverability } from "../lib/reportMatrix";
import { driTagClass, type ProprietaryIndices, type PostMortemResult } from "../types";

interface Props {
  indices: ProprietaryIndices;
  viabilityScore?: number;
  intermediateViability?: number;
  recoverability?: PostMortemResult["recoverability"];
  /** When false, stall and risk scores stay off the snapshot. */
  showScorecard?: boolean;
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

export default function DealHeaderMetrics({
  indices: pi,
  viabilityScore,
  intermediateViability,
  recoverability,
  showScorecard = true,
}: Props) {
  if (!showScorecard) {
    return (
      <section className="deal-header-metrics" aria-label="Primary deal metrics">
        <div className="deal-header-metrics-top">
          <h2 className="deal-header-metrics-title">Forecast snapshot</h2>
        </div>
        <p className="deal-metric-detail-text">Not a deal. Stall metrics are not applied.</p>
      </section>
    );
  }
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
          detail={
            pi.explanations?.deal_risk.summary ??
            "Evidence the deal may stall further or be lost. Not a close probability."
          }
          accentClass={driClass}
        />
        <MetricCard
          label="Dept friction (DFI)"
          value={formatScoreOutOf100(pi.multi_department_friction)}
          detail={
            pi.explanations?.department_friction.summary ??
            "Department words in the stakeholder text. A word match is not resistance."
          }
        />
        <MetricCard
          label="Dispersion"
          value={formatScoreOutOf100(pi.stakeholder_dispersion_index)}
          detail={
            pi.explanations?.dispersion.summary ??
            "How split the mapped stakeholders are. Only the supplied people count."
          }
        />
        <MetricCard
          label="Stall signals"
          value={formatScoreOutOf100(pi.dialogue_stall_score)}
          detail={
            pi.explanations?.stall.summary ??
            "Deferral language in the text. A delayed meeting is not a rejection."
          }
        />
        <MetricCard
          label="Viability"
          value={formatScoreOutOf100(viabilityScore)}
          detail={
            [
              "The viability formula. A zero is the floor of that formula, not a recoverability judgment.",
              intermediateViability !== undefined &&
              viabilityScore !== undefined &&
              intermediateViability !== viabilityScore
                ? `The score shown is the final derived viability (${viabilityScore}). Cycle 1 at ${intermediateViability} is an intermediate calculation step.`
                : null,
            ]
              .filter((line): line is string => Boolean(line))
              .join(" ")
          }
        />
        <MetricCard
          label="Recoverability"
          value={recoverability ? formatRecoverability(recoverability.status) : "—"}
          detail={
            recoverability?.explanation ??
            "Recoverability is judged from whether a path still exists. It is not the viability score."
          }
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
