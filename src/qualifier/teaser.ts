import type { PostMortemResult, StakeholderSignal } from "../types";

export type DealTeaser = {
  risk: number | null;
  riskTier: string | null;
  verdict: string;
  blocker: string;
  quote: string;
  thisWeek: string[];
};

/** Only a clean recoverable verdict can open the commitment question. */
export function scoreVerdict(result: PostMortemResult): "Flat no" | "Checkpoint" | "Recoverable" {
  const blob = [
    result.recoverability?.status,
    result.deal_status,
    result.deal_classification?.status,
    result.deal_trajectory?.trajectory_type,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .toUpperCase();
  if (/FLAT|NOT_CURRENTLY|NOT CURRENTLY/.test(blob)) return "Flat no";
  if (/CHECKPOINT|MOTION NOT ESTABLISHED|UNDETERMINED/.test(blob)) return "Checkpoint";
  if (/CONDITIONALLY_RECOVERABLE|CONDITIONAL_RECOVERABLE|\bRECOVERABLE\b/.test(blob)) return "Recoverable";
  return "Checkpoint";
}

function detractorQuote(people: StakeholderSignal[] | undefined): string {
  const list = people ?? [];
  const detractor = list.find((person) =>
    /detractor|veto|blocker|procurement|security|legal/i.test(
      `${person.persona_type ?? ""} ${person.stance ?? ""} ${person.role ?? ""}`
    )
  );
  const chosen = detractor ?? list.find((person) => person.evidence?.trim());
  return chosen?.evidence?.trim() ?? "";
}

/** Pull the teaser fields off a post-mortem. The this-week list stays off the page until a morning is booked. */
export function readTeaser(result: PostMortemResult): DealTeaser {
  const indices = result.proprietary_indices;
  const risk = typeof indices?.deal_risk_index === "number" ? indices.deal_risk_index : null;
  const verdict = scoreVerdict(result);
  const force = (result.causal_forces ?? []).find((item) => item.type === "Constraint" || item.type === "Structural");
  const blocker =
    result.recoverability?.blocking_conditions?.find((line) => line.trim())?.trim() ||
    result.equilibrium_analysis?.equilibrium_breaker?.trim() ||
    force?.factor?.trim() ||
    "The score did not name one blocker.";
  const quote = detractorQuote(result.stakeholders) || force?.evidence?.trim() || blocker;
  const thisWeek = (result.immediate_remediation ?? []).map((line) => line.trim()).filter(Boolean);
  const fallback = (result.rescue_triage_plan?.immediate_0_30_days ?? [])
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    risk,
    riskTier: indices?.risk_tier ?? null,
    verdict,
    blocker,
    quote,
    thisWeek: thisWeek.length ? thisWeek : fallback,
  };
}
