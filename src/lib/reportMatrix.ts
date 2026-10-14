import { uniqueActionSteps } from "./actionSteps";
import { uniqueRecoveryNotes } from "./recoveryPlan";

/** One threshold table for every transcript. Headline, scorecard, and notes read this tier. */
export const RISK_THRESHOLDS = {
  critical: 75,
  high: 55,
  moderate: 35,
} as const;

export type RiskTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export type RecoverabilityStatus =
  | "RECOVERABLE"
  | "CONDITIONALLY_RECOVERABLE"
  | "UNDETERMINED"
  | "NOT_CURRENTLY_RECOVERABLE";

export type ForceDuration = "TEMPORARY" | "CONDITIONAL" | "ONGOING" | "PERMANENT" | "UNKNOWN";

export interface ForceScoreEffect {
  dimension: "structural_lock_in" | "constraint_pressure" | "intent_strength" | "enabler_strength" | "none";
  included: boolean;
  reason: string;
  duration: ForceDuration;
}

export interface MatrixForce {
  factor: string;
  type: string;
  weight: number;
  role?: string;
  derived_from?: string[];
  evidence: string;
  score_effect?: ForceScoreEffect;
}

export interface RecoverabilityAssessment {
  status: RecoverabilityStatus;
  confidence: number;
  blocking_conditions: string[];
  evidence_gaps: string[];
  /** Why this status was reached. A viability score is not this text. */
  explanation: string;
}

export interface ReportCheck {
  id: string;
  passed: boolean;
  detail: string;
}

export interface ReportValidation {
  passed: boolean;
  checks: ReportCheck[];
}

export function classifyRisk(score: number): RiskTier {
  if (score >= RISK_THRESHOLDS.critical) return "CRITICAL";
  if (score >= RISK_THRESHOLDS.high) return "HIGH";
  if (score >= RISK_THRESHOLDS.moderate) return "MODERATE";
  return "LOW";
}

export function stalledHeadline(tier: RiskTier): string {
  return `STALLED — ${tier} RISK`;
}

export function formatRecoverability(status: RecoverabilityStatus): string {
  switch (status) {
    case "RECOVERABLE":
      return "Recoverable";
    case "CONDITIONALLY_RECOVERABLE":
      return "Conditionally recoverable";
    case "UNDETERMINED":
      return "Undetermined";
    case "NOT_CURRENTLY_RECOVERABLE":
      return "Not currently recoverable";
  }
}

const RESOURCE_CONDITION =
  /\b(can'?t commit|cannot commit|no capacity|another integration|capacity constraint|can'?t start|cannot start)\b/i;
const FINANCIAL_CONDITION =
  /\b(financial case|actual savings|defensible|too optimistic|additional approval|signs off on the spend|discretionary spending|spending freeze|freezing discretionary)\b/i;
const FINANCIAL_PARENT = /\b(freez|frozen|discretionary|spending freeze|budget|additional approval)\b/i;
const COMPETITIVE_CONDITION = /\b(flowtrack|another platform|competing pilot|pilot)\b/i;
const SPONSORSHIP_CONDITION =
  /\b(not pushing|disengag|hasn'?t said otherwise|haven'?t had a proper|inactive sponsor)\b/i;
const PERMANENT_DURATION = /\b(permanent|prohibited|banned|structurally locked)\b/i;
const TEMPORARY_DURATION =
  /\b(until the end of the quarter|end of the quarter|this quarter|next quarter|90 days|for the next|temporary|additional approval|freezing discretionary|discretionary spending)\b/i;
const CONDITIONAL_DURATION =
  /\b(financial case|can'?t commit|cannot commit|defensible|validated savings|if independently|when the|once the)\b/i;
const PATH_FORWARD =
  /\b(hasn'?t disappeared|has not disappeared|still looking|don'?t think we should close|do not think we should close|bringing it back|bring it back|comfortable bringing|send (me )?the outline|will approve if|can begin next quarter|not necessarily impossible)\b/i;
const CLOSED_PATH = [
  /\b(selected|chose|chosen|awarded the business to|going with|went with)\b(?:\s+\w+){0,8}\b(competitor|another vendor|another platform|flowtrack)\b/i,
  /\b(terminated|ended|cancelled|canceled) the (evaluation|process|opportunity)\b/i,
  /\b(will not|won't|decided not to|no longer) (move forward|proceed|continue|buy)\b/i,
  /\bbudget (has been|was) (permanently )?allocated elsewhere\b/i,
  /\b(no viable path|no path forward)\b/i,
];

function closedPathReason(text: string): string | null {
  const withoutNegatedClose = text.replace(
    /\b(?:do not|don't|dont|should not|shouldn't|not)\b(?:\s+\w+){0,6}\s+close the door\b/gi,
    " "
  );
  if (/\bclose the door\b/i.test(withoutNegatedClose)) {
    return "The evaluation was closed.";
  }
  for (const pattern of CLOSED_PATH) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function blob(force: MatrixForce): string {
  return `${force.factor} ${force.evidence}`;
}

export function forceDuration(force: MatrixForce): ForceDuration {
  const text = blob(force);
  if (PERMANENT_DURATION.test(text)) return "PERMANENT";
  if (TEMPORARY_DURATION.test(text)) return "TEMPORARY";
  if (CONDITIONAL_DURATION.test(text)) return "CONDITIONAL";
  if (/\b(ongoing|remains in effect|no end date)\b/i.test(text)) return "ONGOING";
  return "UNKNOWN";
}

function maxOf(forces: MatrixForce[], type: string): number {
  const weights = forces.filter((force) => force.type.toLowerCase() === type).map((force) => force.weight);
  return weights.length ? Math.max(...weights) : 0;
}

/**
 * Map each force onto one scoring input. Overlapping evidence is kept once.
 * A force that does not move a score still carries the reason it was left out.
 */
export function mapForcesToScores(forces: MatrixForce[]): {
  forces: MatrixForce[];
  constraint_pressure: number;
  structural_lock_in: number;
  trace: string[];
} {
  const structural_lock_in = maxOf(forces, "structural");
  const constraintWeights = forces
    .filter((force) => force.type.toLowerCase() === "constraint" && !COMPETITIVE_CONDITION.test(blob(force)))
    .map((force) => force.weight);
  let constraint_pressure = constraintWeights.length ? Math.max(...constraintWeights) : 0;
  const financialParent = forces.some(
    (force) =>
      (force.type.toLowerCase() === "structural" || force.type.toLowerCase() === "constraint") &&
      FINANCIAL_PARENT.test(blob(force))
  );

  for (const force of forces) {
    if (force.type.toLowerCase() !== "behavioral") continue;
    const text = blob(force);
    if (RESOURCE_CONDITION.test(text)) {
      constraint_pressure = Math.max(constraint_pressure, force.weight);
      continue;
    }
    if (FINANCIAL_CONDITION.test(text) && !financialParent) {
      constraint_pressure = Math.max(constraint_pressure, force.weight);
    }
  }

  const trace: string[] = [];
  const annotated = forces.map((force) => {
    const text = blob(force);
    const duration = forceDuration(force);
    const type = force.type.toLowerCase();
    let score_effect: ForceScoreEffect;

    if (type === "intent") {
      const intentMax = maxOf(forces, "intent");
      const included = force.weight === intentMax && intentMax > 0;
      score_effect = {
        dimension: "intent_strength",
        included,
        duration,
        reason: included
          ? "Intent is the strongest Intent-force weight. It is separate from approval."
          : `Intent stays at ${intentMax}, the stronger willingness statement. This one is not added again.`,
      };
    } else if (type === "enabler") {
      score_effect = {
        dimension: "enabler_strength",
        included: true,
        duration,
        reason: "Enabler strength is the strongest Enabler-force weight.",
      };
    } else if (type === "structural") {
      const included = force.weight === structural_lock_in;
      score_effect = {
        dimension: "structural_lock_in",
        included,
        duration,
        reason: included
          ? "This is the strongest structural force, so it sets structural pressure."
          : `Structural pressure stays at ${structural_lock_in}, the stronger structural force. This one is not added again.`,
      };
    } else if (type === "constraint" && COMPETITIVE_CONDITION.test(text)) {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason:
          "A pilot or competitive preference is recorded. It does not add constraint pressure, and a pilot is not a confirmed purchase.",
      };
    } else if (type === "constraint") {
      const included = force.weight === constraint_pressure;
      score_effect = {
        dimension: "constraint_pressure",
        included,
        duration,
        reason: included
          ? "This is the strongest constraint, so it sets constraint pressure."
          : `Constraint pressure stays at ${constraint_pressure}, the stronger constraint. This one is not added again.`,
      };
    } else if (type === "behavioral" && RESOURCE_CONDITION.test(text)) {
      const included = force.weight === constraint_pressure;
      score_effect = {
        dimension: "constraint_pressure",
        included,
        duration,
        reason: included
          ? "A resource limit sets constraint pressure. It is not treated as opposition."
          : `A resource limit is recorded. Constraint pressure stays at the stronger constraint (${constraint_pressure}) and this weight is not added on top.`,
      };
    } else if (type === "behavioral" && FINANCIAL_CONDITION.test(text)) {
      score_effect = financialParent
        ? {
            dimension: "constraint_pressure",
            included: false,
            duration,
            reason:
              "This financial condition overlaps a spending or budget force already in the structural or constraint score. It is not counted a second time.",
          }
        : {
            dimension: "constraint_pressure",
            included: force.weight === constraint_pressure,
            duration,
            reason: "No separate spending freeze is scored, so this financial condition sets constraint pressure.",
          };
    } else if (type === "behavioral" && COMPETITIVE_CONDITION.test(text)) {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason:
          "A pilot or competitive preference is recorded. It does not add a second structural lock on top of the strongest structural force, and a pilot is not a confirmed purchase.",
      };
    } else if (type === "behavioral" && SPONSORSHIP_CONDITION.test(text)) {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason: "Inactivity or weak sponsorship is not opposition and does not add constraint pressure.",
      };
    } else if (type === "timing") {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason: "Timing is read by the timing factor, not by constraint pressure.",
      };
    } else {
      score_effect = {
        dimension: "none",
        included: false,
        duration,
        reason:
          "This force does not state a separate financial, resource, or permanent condition, so it does not change constraint or structural pressure.",
      };
    }

    trace.push(`${force.factor}: ${score_effect.included ? "counted" : "not counted"} — ${score_effect.reason}`);
    return { ...force, score_effect };
  });

  return { forces: annotated, constraint_pressure, structural_lock_in, trace };
}

export function classifyRecoverability(input: {
  viability: number;
  trajectory: string;
  blocker: string;
  intent: number;
  forces: MatrixForce[];
  evidence?: string;
}): RecoverabilityAssessment {
  const blocker = input.blocker.toUpperCase();
  const corpus = [input.evidence ?? "", ...input.forces.map((force) => `${force.factor} ${force.evidence}`)].join("\n");
  const closed = closedPathReason(corpus);
  const permanentBan =
    input.trajectory === "NON-VIABLE / DEAD" ||
    (blocker.includes("PERMANENT") && input.forces.some((force) => force.score_effect?.duration === "PERMANENT"));
  const durations = input.forces.map((force) => force.score_effect?.duration ?? forceDuration(force));
  const changeable = durations.some((duration) => duration === "TEMPORARY" || duration === "CONDITIONAL");
  const pathForward = input.intent > 0 && PATH_FORWARD.test(corpus);
  const blocking_conditions = input.forces
    .filter((force) => {
      const duration = force.score_effect?.duration ?? "UNKNOWN";
      return duration === "TEMPORARY" || duration === "CONDITIONAL" || duration === "PERMANENT";
    })
    .map((force) => force.factor);
  const evidence_gaps = input.forces
    .filter((force) => (force.score_effect?.duration ?? "UNKNOWN") === "UNKNOWN" && force.weight >= 50)
    .map((force) => `${force.factor}: duration is not established.`);

  if (closed) {
    return {
      status: "NOT_CURRENTLY_RECOVERABLE",
      confidence: 75,
      blocking_conditions,
      evidence_gaps,
      explanation: `Not currently recoverable. The evidence shows no viable path in this decision horizon: ${closed}. A permanent prohibition is one way to reach this status. It is not the only way. Viability ${input.viability} is not that finding.`,
    };
  }
  if (permanentBan) {
    return {
      status: "NOT_CURRENTLY_RECOVERABLE",
      confidence: 80,
      blocking_conditions,
      evidence_gaps,
      explanation: `Not currently recoverable. The evidence supports a permanent prohibition. Viability ${input.viability} is the formula result, and the prohibition is what closes the path.`,
    };
  }
  if (input.forces.length === 0 && input.intent <= 0) {
    return {
      status: "UNDETERMINED",
      confidence: 30,
      blocking_conditions: [],
      evidence_gaps: ["No scored forces and no stated willingness. Recoverability is not established."],
      explanation:
        "Undetermined. There is not enough evidence to judge whether a recovery path exists. Viability is not a substitute for that judgment.",
    };
  }
  if (
    input.viability >= 55 &&
    (input.trajectory === "ACTIVE" ||
      input.trajectory === "VALIDATED / VELOCITY" ||
      input.trajectory === "DEFERRED (recoverable)")
  ) {
    return {
      status: "RECOVERABLE",
      confidence: 70,
      blocking_conditions,
      evidence_gaps,
      explanation: `Recoverable. Viability ${input.viability} and the trajectory still support a path.`,
    };
  }
  if (changeable && pathForward) {
    const conditions = blocking_conditions.length ? blocking_conditions.join("; ") : "a stated condition";
    return {
      status: "CONDITIONALLY_RECOVERABLE",
      confidence: 60,
      blocking_conditions,
      evidence_gaps,
      explanation: `Conditionally recoverable. The buyer has stated that pursuit can continue, and a condition can still change: ${conditions}. Viability ${input.viability} is the formula floor or result. It does not mean the path is closed.`,
    };
  }
  if (changeable && !pathForward) {
    return {
      status: "UNDETERMINED",
      confidence: 40,
      blocking_conditions,
      evidence_gaps: [
        ...evidence_gaps,
        "A temporary or conditional blocker is present, and the evidence does not show that the buyer still intends to continue.",
      ],
      explanation: `Undetermined. A temporary or conditional obstacle is present, and that alone does not show the buyer still intends to purchase. Viability ${input.viability} is not a recoverability judgment.`,
    };
  }
  return {
    status: "UNDETERMINED",
    confidence: 40,
    blocking_conditions,
    evidence_gaps: evidence_gaps.length
      ? evidence_gaps
      : ["The viability score does not establish whether a later path exists."],
    explanation: `Undetermined. The evidence does not show both a continuing path and a condition that can change. Viability ${input.viability} is not that judgment.`,
  };
}

export function validateReportMatrix(input: {
  status: string;
  riskTier?: string;
  viability: number;
  recoverabilityStatus?: string;
  forces: MatrixForce[];
  immediateActionCount: number;
  stakeholders?: { persona_type?: string; stance?: string; evidence?: string }[];
}): ReportValidation {
  const checks: ReportCheck[] = [];
  const tier = (input.riskTier ?? "").toUpperCase();
  const stalled = input.status.startsWith("STALLED —") && input.status.includes("RISK");
  checks.push({
    id: "score_label_consistency",
    passed: !stalled || !tier || input.status.includes(`${tier} RISK`),
    detail: stalled
      ? `Headline "${input.status}" and risk tier ${tier || "missing"}.`
      : "Headline is not a stalled risk label.",
  });
  const recoverabilityKnown = [
    "RECOVERABLE",
    "CONDITIONALLY_RECOVERABLE",
    "UNDETERMINED",
    "NOT_CURRENTLY_RECOVERABLE",
  ].includes(input.recoverabilityStatus ?? "");
  checks.push({
    id: "viability_recoverability",
    passed: recoverabilityKnown && !(input.viability === 0 && input.recoverabilityStatus === undefined),
    detail: recoverabilityKnown
      ? `Viability ${input.viability} is separate from recoverability ${input.recoverabilityStatus}.`
      : "Recoverability status is missing, so a viability result could be read as the judgment.",
  });
  const material = input.forces.filter((force) => force.weight >= 50);
  const untraced = material.filter((force) => !force.score_effect?.reason);
  checks.push({
    id: "force_score_consistency",
    passed: untraced.length === 0,
    detail: untraced.length
      ? `No scoring effect recorded for: ${untraced.map((force) => force.factor).join(", ")}.`
      : "Every material force has a scoring effect or an exclusion reason.",
  });
  checks.push({
    id: "action_consistency",
    passed: true,
    detail:
      input.immediateActionCount > 0
        ? `${input.immediateActionCount} immediate action(s) are the list every section reads.`
        : "No immediate action is in the canonical list.",
  });
  const opposed =
    /\b(opposed|opposes|will block|against the (deal|purchase|project)|will not approve|won't approve|refuses to approve)\b/i;
  const unlabeledOpposition = (input.stakeholders ?? []).filter((person) => {
    const label = `${person.persona_type ?? ""} ${person.stance ?? ""}`;
    return /hidden detractor/i.test(label) && !opposed.test(person.evidence ?? "");
  });
  checks.push({
    id: "evidence_consistency",
    passed: unlabeledOpposition.length === 0,
    detail: unlabeledOpposition.length
      ? "A detractor label is missing evidence of opposition."
      : "Detractor labels, when present, have evidence of opposition.",
  });
  return { passed: checks.every((check) => check.passed), checks };
}

export function canonicalImmediateActions(result: {
  immediate_remediation?: string[];
  rescue_triage_plan?: { immediate_0_30_days?: string[] };
  action_plan?: string[];
}): string[] {
  const fromPlan = [
    ...(result.immediate_remediation ?? []),
    ...(result.rescue_triage_plan?.immediate_0_30_days ?? []),
  ];
  const fromActionPlan = (result.action_plan ?? []).filter(
    (step) => step.startsWith("[0-30d]") || !/^\[[0-9]/.test(step)
  );
  return uniqueRecoveryNotes(uniqueActionSteps(fromPlan.length ? fromPlan : fromActionPlan));
}
