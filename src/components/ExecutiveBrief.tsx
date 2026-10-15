import ViabilityLineChart from "./ViabilityLineChart";
import { readConstraint } from "../lib/constraintReading";
import { mergeOverlappingQuotes } from "../lib/evidenceQuotes";
import { commercialBaselineFromText } from "../lib/commercialBaseline";
import { forecastGuidance } from "../lib/forecastCall";
import { canonicalImmediateActions, formatRecoverability, matrixFacing } from "../lib/reportMatrix";
import { convergenceExplanation, viabilityCycleDisplay } from "../lib/convergenceNote";
import { recoveryActionLines } from "../lib/recoveryPlan";
import type { PostMortemResult } from "../types";

interface Props {
  result: PostMortemResult;
}

function sentencesFrom(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function labelKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stallProse(result: PostMortemResult): string[] {
  const forceNames = new Set(
    (result.causal_forces ?? []).map((force) => labelKey(force.factor)).filter(Boolean)
  );
  const isForceName = (line: string) => forceNames.has(labelKey(line));
  const lines: string[] = [];
  const summary = result.executive_summary?.trim();
  if (summary) {
    lines.push(...sentencesFrom(summary).filter((line) => !isForceName(line)).slice(0, 2));
  }

  const breaker = result.equilibrium_analysis?.equilibrium_breaker?.trim();
  if (
    breaker &&
    !isForceName(breaker) &&
    !lines.some((line) => line.toLowerCase().includes(breaker.toLowerCase()))
  ) {
    lines.push(/[.!?]$/.test(breaker) ? breaker : `${breaker}.`);
  }

  return lines.slice(0, 4);
}

function evidenceQuotes(result: PostMortemResult): string[] {
  const raw = [
    ...(result.causal_forces ?? []).map((force) => force.evidence),
    ...(result.stakeholders ?? []).map((person) => person.evidence),
  ];
  const seen = new Set<string>();
  const quotes: string[] = [];
  for (const item of raw) {
    const quote = item?.replace(/^"|"$/g, "").trim();
    if (!quote) continue;
    const key = quote.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    quotes.push(quote);
  }
  return mergeOverlappingQuotes(quotes);
}

export default function ExecutiveBrief({ result }: Props) {
  const status = result.deal_classification?.status ?? result.deal_status ?? "UNKNOWN";
  const viability = result.viability_state?.viability_score ?? result.recoverability_score;
  const risk = result.proprietary_indices?.deal_risk_index;
  const riskTier = result.proprietary_indices?.risk_tier;
  const baseline =
    result.commercial_baseline ??
    commercialBaselineFromText(
      [
        result.executive_summary ?? "",
        ...(result.causal_forces ?? []).map((force) => `${force.factor} ${force.evidence}`),
        ...(result.stakeholders ?? []).map((person) => `${person.name} ${person.role ?? ""}`),
        ...(result.immediate_remediation ?? []),
      ].join("\n")
    );
  const baselineParts = [
    baseline.fee,
    baseline.owner ? `Account Owner: ${baseline.owner}` : null,
    baseline.target ? `Baseline Target: ${baseline.target}` : null,
  ].filter((part): part is string => Boolean(part));
  const riskLabel = riskTier ? riskTier.charAt(0) + riskTier.slice(1).toLowerCase() : null;
  const prose = stallProse(result);
  const allQuotes = evidenceQuotes(result);
  const quotes = allQuotes.slice(0, 2);
  const hiddenQuotes = allQuotes.length - quotes.length;
  const constraintText = [
    result.executive_summary ?? "",
    ...(result.causal_forces ?? []).map((force) => `${force.factor} ${force.evidence}`),
    ...(result.stakeholders ?? []).map((person) => `${person.name} ${person.role ?? ""} ${person.evidence}`),
  ].join("\n");
  const constraint = readConstraint(constraintText);
  const facing = matrixFacing({
    status: typeof status === "string" ? status : undefined,
    trajectory: result.deal_trajectory?.trajectory_type,
    recoverabilityStatus: result.recoverability?.status,
  });
  const guidance = forecastGuidance({
    status: typeof status === "string" ? status : undefined,
    trajectory: result.deal_trajectory?.trajectory_type,
    recoverability: viability,
    viabilityState: result.viability_state?.state,
  });
  const steps = guidance.showRecoveryPlan ? canonicalImmediateActions(result) : [];
  const cycleRows = result.resolution_cycles?.cycles ?? [];
  const viabilityDisplay = viabilityCycleDisplay(cycleRows, viability);
  const convergence = convergenceExplanation({
    convergenceStatus: result.resolution_cycles?.convergence_status,
    totalCycles: result.resolution_cycles?.total_cycles ?? cycleRows.length,
    equilibrium: result.equilibrium_analysis?.state,
    trajectory: facing.trajectoryLabel,
  });

  return (
    <section className="executive-brief" aria-label="Executive brief">
      <ViabilityLineChart
        caption={cycleRows.length > 1 ? "Viability by calculation cycle" : "Viability"}
        points={
          cycleRows.length > 0
            ? cycleRows.map((cycle, index) => ({
                label: index === cycleRows.length - 1 ? "Final" : `Cycle ${cycle.cycle}`,
                value: cycle.state_snapshot.viability_score,
              }))
            : viability !== undefined
              ? [{ label: "Final", value: viability }]
              : []
        }
      />

      <div className="executive-brief-status">
        <p className="executive-brief-status-label">Current Status: {status}</p>
        {baselineParts.length > 0 && (
          <p className="executive-brief-commercial">Commercial Baseline: {baselineParts.join(" | ")}</p>
        )}
        <p className="executive-brief-status-metrics">
          {viabilityDisplay.intermediate !== null && (
            <span>Cycle 1 intermediate: {viabilityDisplay.intermediate}</span>
          )}
          {viability !== undefined && <span>Final derived viability: {viability}</span>}
          {risk !== undefined && (
            <span>
              Deal Risk Index: {risk}
              {riskLabel ? ` (${riskLabel})` : ""}
            </span>
          )}
          {result.recoverability && (
            <span>Recoverability: {facing.recoverabilityLabel || formatRecoverability(result.recoverability.status)}</span>
          )}
        </p>
        {result.recoverability?.explanation && (
          <p className="meta-line">{result.recoverability.explanation}</p>
        )}
        {viabilityDisplay.note && <p className="meta-line">{viabilityDisplay.note}</p>}
        {convergence && <p className="meta-line">{convergence}</p>}
        {result.report_validation && !result.report_validation.passed && (
          <p className="meta-line">
            Report check failed:{" "}
            {result.report_validation.checks
              .filter((check) => !check.passed)
              .map((check) => check.detail)
              .join(" ")}
          </p>
        )}
      </div>

      {!facing.offForecast && constraint.kind !== "unspecified" && (
        <div className="executive-brief-prose">
          <h2>Primary constraint</h2>
          <p>{constraint.label}</p>
          {constraint.observed.map((line) => (
            <p key={line}>
              <strong>Observed:</strong> {line}
            </p>
          ))}
          <p>
            <strong>Interpretation:</strong> {constraint.interpretation}
          </p>
          {constraint.missing.map((line) => (
            <p key={line}>
              <strong>Not in the evidence:</strong> {line}
            </p>
          ))}
        </div>
      )}

      {(facing.offForecast || constraint.kind === "unspecified") && prose.length > 0 && (
        <div className="executive-brief-prose">
          <h2>{facing.whyTitle}</h2>
          {prose.map((line) => (
            <p key={line}>
              <strong>Interpretation:</strong> {line}
            </p>
          ))}
        </div>
      )}

      {quotes.length > 0 && (
        <div className="executive-brief-evidence">
          <h2>Observed evidence</h2>
          {quotes.map((quote) => (
            <blockquote key={quote}>{quote}</blockquote>
          ))}
          {hiddenQuotes > 0 && (
            <p className="meta-line">
              {hiddenQuotes} more quotation{hiddenQuotes === 1 ? "" : "s"} {hiddenQuotes === 1 ? "is" : "are"} in
              Expanded Analysis.
            </p>
          )}
        </div>
      )}

      <div className="executive-brief-actions">
        <h2>{facing.planTitle}</h2>
        <p>{guidance.line}</p>
        {!guidance.showRecoveryPlan ? (
          <p>No action is proposed until the blocking condition itself changes.</p>
        ) : steps.length === 0 ? (
          <p>No immediate action was identified from the evidence.</p>
        ) : (
          <>
            <ol>
              {steps.map((step) => {
                const lines = recoveryActionLines(step);
                return (
                  <li key={step}>
                    {lines.map((line, index) =>
                      index === 0 ? (
                        <div key={line}>{line}</div>
                      ) : (
                        <div key={line} className="meta-line">
                          {line}
                        </div>
                      )
                    )}
                  </li>
                );
              })}
            </ol>
            <p className="meta-line">
              Owner, stakeholder, progress evidence, and checkpoint appear only when the action states them.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
