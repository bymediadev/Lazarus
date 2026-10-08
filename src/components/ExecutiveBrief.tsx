import ViabilityLineChart from "./ViabilityLineChart";
import { uniqueActionSteps } from "../lib/actionSteps";
import { mergeOverlappingQuotes } from "../lib/evidenceQuotes";
import { commercialBaselineFromText } from "../lib/commercialBaseline";
import { forecastGuidance } from "../lib/forecastCall";
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
  return mergeOverlappingQuotes(quotes).slice(0, 6);
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
  const quotes = evidenceQuotes(result);
  const guidance = forecastGuidance({
    status: typeof status === "string" ? status : undefined,
    trajectory: result.deal_trajectory?.trajectory_type,
    recoverability: viability,
  });
  const steps = guidance.removeFromForecast
    ? []
    : uniqueActionSteps([
        ...(result.immediate_remediation ?? []),
        ...(result.rescue_triage_plan?.immediate_0_30_days ?? []),
      ]);

  return (
    <section className="executive-brief" aria-label="Executive brief">
      <ViabilityLineChart
        points={
          (result.resolution_cycles?.cycles ?? []).length > 0
            ? (result.resolution_cycles?.cycles ?? []).map((cycle) => ({
                label: String(cycle.cycle),
                value: cycle.state_snapshot.viability_score,
              }))
            : viability !== undefined
              ? [{ label: "Now", value: viability }]
              : []
        }
      />

      <div className="executive-brief-status">
        <p className="executive-brief-status-label">Current Status: {status}</p>
        {baselineParts.length > 0 && (
          <p className="executive-brief-commercial">Commercial Baseline: {baselineParts.join(" | ")}</p>
        )}
        <p className="executive-brief-status-metrics">
          {viability !== undefined && <span>Viability: {viability}</span>}
          {risk !== undefined && (
            <span>
              Deal Risk Index: {risk}
              {riskLabel ? ` (${riskLabel})` : ""}
            </span>
          )}
        </p>
      </div>

      {prose.length > 0 && (
        <div className="executive-brief-prose">
          <h2>Why it is stalling</h2>
          {prose.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      {quotes.length > 0 && (
        <div className="executive-brief-evidence">
          <h2>Evidence</h2>
          {quotes.map((quote) => (
            <blockquote key={quote}>{quote}</blockquote>
          ))}
        </div>
      )}

      <div className="executive-brief-actions">
        <h2>How to fix it</h2>
        {guidance.removeFromForecast ? (
          <p>{guidance.line}</p>
        ) : steps.length === 0 ? (
          <p>No immediate action was extracted from this brief.</p>
        ) : (
          <ol>
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
