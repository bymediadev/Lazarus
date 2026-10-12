/** Shared metric legend — intake UI + CRM paste + /100 score mapping. */

export type MetricLegendId =
  | "deal-risk-score"
  | "dfi"
  | "dispersion"
  | "stall-signals"
  | "recoverable-vs-flat-no";

export interface MetricLegendEntry {
  id: MetricLegendId;
  term: string;
  definition: string;
  reportMapsTo: string;
  /** How to read a live score from the report result. */
  scoreKey: "deal_risk_index" | "multi_department_friction" | "stakeholder_dispersion_index" | "dialogue_stall_score" | "viability_score";
}

export const METRIC_LEGEND: readonly MetricLegendEntry[] = [
  {
    id: "deal-risk-score",
    term: "Deal Risk Score",
    definition:
      "Evidence the deal may stall further or be lost, from viability, constraint, structural lock-in, dispersion, stall language, timing, and enabler strength. Not a close probability.",
    reportMapsTo:
      "Shows as the top Forecast snapshot score and Deal Risk Index in the report / CRM notes.",
    scoreKey: "deal_risk_index",
  },
  {
    id: "dfi",
    term: "Department Friction Index (DFI)",
    definition:
      "A count of department words in the stakeholder text, plus a fixed amount when an absent decision maker is mapped. A word match is not proof that the department is resisting.",
    reportMapsTo:
      "Shows as Dept friction on the Forecast snapshot and in Live Deal Triage / Stall Point sections.",
    scoreKey: "multi_department_friction",
  },
  {
    id: "dispersion",
    term: "Dispersion",
    definition:
      "How split the mapped stakeholders are. It only reflects the people supplied in the evidence, not an unseen buying committee.",
    reportMapsTo:
      "Shows as Dispersion on the Forecast snapshot and feeds Stakeholder / People Map friction flags.",
    scoreKey: "stakeholder_dispersion_index",
  },
  {
    id: "stall-signals",
    term: "Stall signals",
    definition:
      "Deferral phrases and department handoffs found in the text. A delayed meeting raises the score and is not, by itself, a rejection.",
    reportMapsTo:
      "Shows as Stall signals on the Forecast snapshot and informs the Stall Point & Resuscitation Plan.",
    scoreKey: "dialogue_stall_score",
  },
  {
    id: "recoverable-vs-flat-no",
    term: "Recoverability",
    definition:
      "Whether a credible path to advance the deal still exists, from intent, constraint, structural lock-in, enabler strength, and timing. Not a close probability.",
    reportMapsTo:
      "Read from viability score (0–100) plus Deal Status and the 0–90 day Resuscitation Plan.",
    scoreKey: "viability_score",
  },
] as const;

/** Clamp to 0–100 for display. Real zeros stay 0. */
export function formatScoreOutOf100(score: number | null | undefined): string {
  if (score == null || !Number.isFinite(Number(score))) return "—/100";
  const n = Math.min(100, Math.max(0, Math.round(Number(score))));
  return `${n}/100`;
}

export interface LegendScoreSource {
  deal_risk_index?: number;
  multi_department_friction?: number;
  stakeholder_dispersion_index?: number;
  dialogue_stall_score?: number;
  viability_score?: number;
}

export function resolveLegendScore(
  entry: MetricLegendEntry,
  scores?: LegendScoreSource | null
): number | null {
  if (!scores) return null;
  const raw = scores[entry.scoreKey];
  if (raw == null || !Number.isFinite(Number(raw))) return null;
  return Math.min(100, Math.max(0, Math.round(Number(raw))));
}

/** Markdown block appended to compressed CRM notes. */
export function formatMetricLegendMarkdown(scores?: LegendScoreSource | null): string {
  const lines = [
    "## Metric legend",
    "",
    "_How Lazarus Deal Recovery terms map to the report (scores out of 100):_",
    "",
  ];
  for (const entry of METRIC_LEGEND) {
    const score = resolveLegendScore(entry, scores);
    const scoreLabel = score == null ? "" : ` **${formatScoreOutOf100(score)}**`;
    lines.push(`**${entry.term}:**${scoreLabel} ${entry.definition}`);
    lines.push(`→ *In the report:* ${entry.reportMapsTo}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
