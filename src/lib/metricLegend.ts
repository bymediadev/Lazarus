/** Shared metric legend — intake UI + CRM paste. */

export const METRIC_LEGEND = [
  {
    id: "deal-risk-score",
    term: "Deal Risk Score",
    definition:
      "A 1–100 macro-rating predicting the likelihood of a deal stalling out or dropping based on historically missed milestones.",
    reportMapsTo:
      "Shows as the top Forecast snapshot score and Deal Risk Index in the report / CRM notes.",
  },
  {
    id: "dfi",
    term: "Department Friction Index (DFI)",
    definition:
      "A gauge measuring the pushback, skepticism, or lack of alignment detected from specific internal departments (e.g., Legal, Security, IT).",
    reportMapsTo:
      "Shows as Dept friction on the Forecast snapshot and in Live Deal Triage / Stall Point sections.",
  },
  {
    id: "dispersion",
    term: "Dispersion",
    definition:
      "A metric calculating how fragmented the buyer's communication is. High dispersion means too many disconnected stakeholders; low dispersion means a unified decision-making front.",
    reportMapsTo:
      "Shows as Dispersion on the Forecast snapshot and feeds Stakeholder / People Map friction flags.",
  },
  {
    id: "stall-signals",
    term: "Stall signals",
    definition:
      "Pressure from missed cadence, unresolved objections, and dialogue that stops moving the deal forward.",
    reportMapsTo:
      "Shows as Stall signals on the Forecast snapshot and informs the Stall Point & Resuscitation Plan.",
  },
  {
    id: "recoverable-vs-flat-no",
    term: "Recoverable vs flat no",
    definition:
      "Whether a stalled deal still deserves manager effort (recoverable) or should be cut from the forecast (flat no).",
    reportMapsTo:
      "Read from Deal Status, Stall Point, and the 0–90 day Resuscitation Plan in the report.",
  },
] as const;

/** Markdown block appended to compressed CRM notes. */
export function formatMetricLegendMarkdown(): string {
  const lines = [
    "## Metric legend",
    "",
    "_How Lazarus terms map to the report:_",
    "",
  ];
  for (const entry of METRIC_LEGEND) {
    lines.push(`**${entry.term}:** ${entry.definition}`);
    lines.push(`→ *In the report:* ${entry.reportMapsTo}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
