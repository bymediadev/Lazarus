import ForceEquilibriumChart from "./ForceEquilibriumChart";
import { uniqueActionSteps } from "../lib/actionSteps";
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

function stallProse(result: PostMortemResult): string[] {
  const lines: string[] = [];
  const summary = result.executive_summary?.trim();
  if (summary) lines.push(...sentencesFrom(summary).slice(0, 2));

  const breaker = result.equilibrium_analysis?.equilibrium_breaker?.trim();
  if (breaker && !lines.some((line) => line.toLowerCase().includes(breaker.toLowerCase()))) {
    lines.push(/[.!?]$/.test(breaker) ? breaker : `${breaker}.`);
  }

  const constraint = (result.causal_forces ?? []).find((force) => force.type === "Constraint");
  if (
    constraint?.factor &&
    lines.length < 4 &&
    !lines.some((line) => line.toLowerCase().includes(constraint.factor.toLowerCase()))
  ) {
    const factor = constraint.factor.replace(/\.$/, "");
    lines.push(`The binding constraint is ${factor}.`);
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
  return quotes.slice(0, 6);
}

export default function ExecutiveBrief({ result }: Props) {
  const status = result.deal_classification?.status ?? result.deal_status ?? "UNKNOWN";
  const viability = result.viability_state?.viability_score ?? result.recoverability_score;
  const risk = result.proprietary_indices?.deal_risk_index;
  const prose = stallProse(result);
  const quotes = evidenceQuotes(result);
  const steps = uniqueActionSteps([
    ...(result.immediate_remediation ?? []),
    ...(result.rescue_triage_plan?.immediate_0_30_days ?? []),
  ]);

  return (
    <section className="executive-brief" aria-label="Executive brief">
      <ForceEquilibriumChart
        forces={result.causal_forces ?? []}
        effectiveIntent={result.buyer_state?.effective_intent ?? 0}
      />

      <div className="executive-brief-status">
        <p className="executive-brief-status-label">{status}</p>
        <p className="executive-brief-status-metrics">
          {viability !== undefined && <span>Viability {viability}</span>}
          {risk !== undefined && <span>Deal risk {risk}</span>}
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
        {steps.length === 0 ? (
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
