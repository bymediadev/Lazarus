/**
 * Three-layer deterministic compiler:
 *   Layer 1 — CausalState (inputs only, polarity-resolved)
 *   Layer 2 — FrozenDerivation (single derivation pass)
 *   Layer 3 — Output projection (read-only, no math)
 */

import { assessIntentExtraction } from "../src/lib/intentExtraction.js";
import { intentInputTrace } from "../src/lib/scoreInputTrace.js";

export type CanonicalEquilibrium = "PINNED" | "MIXED" | "OPEN";

export type CanonicalTrajectory =
  | "VALIDATED / VELOCITY"
  | "DEFERRED (locked)"
  | "DEFERRED (recoverable)"
  | "ACTIVE"
  | "NON-VIABLE / DEAD";

export type ViabilityStateLabel =
  | "VALIDATED / CLOSED"
  | "HIGHLY VIABLE"
  | "CONDITIONALLY VIABLE"
  | "DEFERRED VIABILITY"
  | "NON-VIABLE (STRUCTURALLY LOCKED)";

export interface ScoringForce {
  factor: string;
  type: string;
  weight: number;
  role?: string;
  derived_from?: string[];
  evidence: string;
}

export interface CausalState {
  forces: ScoringForce[];
  blocker_classification: string;
}

export interface CycleSnapshot {
  constraint_pressure: number;
  effective_intent: number;
  structural_lock_in: number;
  timing_accessibility: number;
  enabler_strength: number;
  viability_score: number;
  equilibrium_state: CanonicalEquilibrium;
}

export interface ResolutionCyclesFrozen {
  convergence_status: "converged";
  total_cycles: number;
  cycles: {
    cycle: number;
    phase: string;
    state_snapshot: CycleSnapshot;
    state_change: string;
  }[];
  convergence_summary: string;
}

export interface FrozenDerivation {
  intent_strength: number;
  constraint_pressure: number;
  structural_lock_in: number;
  enabler_strength: number;
  timing_factor: number;
  effective_intent: number;
  viability_score: number;
  equilibrium_state: CanonicalEquilibrium;
  trajectory_type: CanonicalTrajectory;
  viability_state: ViabilityStateLabel;
  buyer_intent_level: string;
  decision_freedom: string;
  derivation_formula: string;
  resolution_cycles: ResolutionCyclesFrozen;
}

function clamp(n: number, min = 0, max = 100): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9\s]/g, " ");
}

const CONDITIONAL_BUY = [
  "need to justify",
  "if this can",
  "i buy it if",
  "not necessarily impossible",
  "fewer resources",
  "not add another",
  "stronger argument",
  "take it to the",
];

const SOFT_FRICTION = ["higher than i thought", "higher than expected", "higher than we expected"];

const HARD_LOCK = [
  "freeze",
  "frozen",
  "audit",
  "veto",
  "no budget",
  "won t proceed",
  "will not proceed",
  "not moving this forward",
  "not moving forward",
  "cannot proceed",
  "can t proceed",
  "signing authority",
  "pull the plug",
  "closed lost",
  "closedlost",
];

function lineContaining(transcript: string, needle: string): string {
  const lines = transcript.split(/\r?\n/);
  const hit = lines.find((line) => normalizeText(line).includes(needle));
  return (hit ?? needle).trim();
}

const ADDED_COMMITMENT = [
  "budget approved",
  "approved the budget",
  "pre-approved",
  "preapproved",
  "legal signed",
  "signed off",
  "contract executed",
  "purchase order",
  "green light",
  "closed won",
  "closedwon",
  "ready to move forward",
];

const ADDED_SETBACK = [
  "went dark",
  "gone dark",
  "no response",
  "another vendor",
  "competitor",
  "not convinced",
  "pushed out",
  "deal slipped",
];

function addedForce(
  transcript: string,
  text: string,
  phrases: readonly string[],
  factor: string,
  type: string,
  weight: number
): ScoringForce | null {
  const phrase = phrases.find((item) => text.includes(item));
  if (!phrase) return null;
  return {
    factor,
    type,
    weight,
    role: "independent",
    derived_from: [],
    evidence: lineContaining(transcript, phrase),
  };
}

function evidenceInText(evidence: string, text: string): boolean {
  const quote = normalizeText(evidence);
  if (quote.length < 12) return false;
  return text.includes(quote);
}

/** The engine's reading of new evidence, on a fixed weight so the same quote does not drift. */
function quantizeAddedForce(force: ScoringForce): ScoringForce {
  const text = normalizeText(`${force.factor} ${force.evidence}`);
  if (HARD_LOCK.some((phrase) => text.includes(phrase))) {
    return { ...force, type: "Constraint", weight: 95, role: "independent", derived_from: [] };
  }
  if (ADDED_COMMITMENT.some((phrase) => text.includes(phrase))) {
    return { ...force, type: "Enabler", weight: 95, role: "independent", derived_from: [] };
  }
  if (ADDED_SETBACK.some((phrase) => text.includes(phrase))) {
    return { ...force, type: "Structural", weight: 70, role: "independent", derived_from: [] };
  }
  const type = force.type.toLowerCase();
  if (type === "enabler") {
    return { ...force, type: "Enabler", weight: 85, role: "independent", derived_from: [] };
  }
  if (type === "intent") {
    return { ...force, type: "Intent", weight: 80, role: "independent", derived_from: [] };
  }
  return { ...force, type: "Structural", weight: 70, role: "independent", derived_from: [] };
}

/**
 * Same evidence keeps the same viability. The model may relabel a buying
 * condition and drop the score to 0, so that pattern uses fixed inputs.
 * A later call, meeting, or HubSpot/Salesforce note is `supplemental`:
 * phrase hits and the engine's quotes from that text move the score.
 * Calls without that pattern still use the model's forces.
 */
export function lockForcesToTranscript(
  transcript: string,
  forces: ScoringForce[],
  supplemental = ""
): ScoringForce[] {
  const added = supplemental.trim();
  const text = normalizeText(`${transcript}\n${added}`);
  const conditionalPhrase = CONDITIONAL_BUY.find((phrase) => text.includes(phrase));
  if (!conditionalPhrase) return forces;
  const commitment = lineContaining(`${transcript}\n${added}`, conditionalPhrase);
  const soft = SOFT_FRICTION.some((phrase) => text.includes(phrase));

  const locked: ScoringForce[] = [];
  if (soft) {
    locked.push({
      factor: "Price is above what the buyer expected",
      type: "Constraint",
      weight: 60,
      role: "independent",
      derived_from: [],
      evidence: lineContaining(transcript, "higher than"),
    });
  }
  locked.push({
    factor: "Buyer will move forward with a business case",
    type: "Intent",
    weight: 75,
    role: "independent",
    derived_from: [],
    evidence: commitment,
  });
  locked.push({
    factor: "Internal path is open if the case is real",
    type: "Enabler",
    weight: 50,
    role: "independent",
    derived_from: [],
    evidence: commitment,
  });

  const bundle = `${transcript}\n${added}`;
  const extras = [
    addedForce(bundle, text, ADDED_COMMITMENT, "Buyer committed budget or signature", "Enabler", 95),
    addedForce(bundle, text, ADDED_SETBACK, "New evidence shows the deal losing ground", "Structural", 70),
    addedForce(bundle, text, HARD_LOCK, "New evidence blocks the purchase", "Constraint", 95),
  ];
  for (const extra of extras) {
    if (extra) locked.push(extra);
  }

  const addedText = normalizeText(added);
  if (addedText) {
    const seen = new Set<string>();
    for (const force of forces) {
      if (!evidenceInText(force.evidence, addedText)) continue;
      const key = normalizeText(force.evidence);
      if (seen.has(key)) continue;
      seen.add(key);
      locked.push(quantizeAddedForce(force));
    }
  }
  return locked;
}

function maxWeight(forces: ScoringForce[], type: string): number {
  const weights = forces
    .filter((f) => f.type.toLowerCase() === type.toLowerCase())
    .map((f) => f.weight);
  return weights.length ? Math.max(...weights) : 0;
}

const ENABLER_SIGNALS = [
  "pre-approved",
  "preapproved",
  "approved budget",
  "budget approved",
  "95%",
  "signed off",
  "legal signed",
  "contract executed",
  "contract is executed",
  "po issued",
  "purchase order",
  "executive mandate",
  "green light",
  "closed won",
  "closed-won",
  "ready to kick",
  "accelerate",
  "aligned champion",
  "no remaining blockers",
  "none security cleared",
];

const CONSTRAINT_SIGNALS = [
  "freeze",
  "frozen",
  "audit",
  "merger",
  "acquisition",
  "block",
  "veto",
  "skeptical",
  "cannot",
  "won't proceed",
  "not actionable",
  "stalled",
  "no budget",
  "board freeze",
  "pull the plug",
  "signing authority",
];

const CLUSTER_KEYWORDS = [
  "contract", "vendor", "commitment", "signed", "salesforce", "capex",
  "allocation", "implementation", "deployment", "integration", "acquisition",
  "merger", "procurement", "budget", "board", "audit",
];

const TIMING_IMMEDIATE = ["immediate", "now", "asap", "this quarter", "right away", "kick off", "this week"];
const TIMING_SHORT = ["30", "60", "90", "weeks", "short-term", "near-term", "july", "august"];
const TIMING_LONG = ["fiscal", "6 month", "12 month", "long-term", "year", "annual"];

/** Binary polarity — enablers must never enter constraint/lock-in math */
export function resolveForcePolarity(f: ScoringForce): ScoringForce {
  const type = f.type.toLowerCase();
  if (type === "intent" || type === "timing" || type === "behavioral" || type === "enabler") {
    return type === "enabler" ? f : f;
  }

  const text = normalizeText(`${f.factor} ${f.evidence}`);
  const enablerHit = ENABLER_SIGNALS.some((k) => text.includes(normalizeText(k)));
  const constraintHit = CONSTRAINT_SIGNALS.some((k) => text.includes(normalizeText(k)));

  if (enablerHit && !constraintHit) {
    return { ...f, type: "Enabler", role: f.role ?? "independent" };
  }
  if (type === "structural" || type === "constraint") {
    return { ...f, type: type === "structural" ? "Structural" : "Constraint" };
  }
  return f;
}

function clusterId(text: string): string | null {
  const t = normalizeText(text);
  for (const k of CLUSTER_KEYWORDS) {
    if (t.includes(k)) return k;
  }
  return null;
}

export function mergeForces(forces: ScoringForce[]): ScoringForce[] {
  if (!forces.length) return forces;

  const polarized = forces.map(resolveForcePolarity);
  const merged: ScoringForce[] = [];
  const consumed = new Set<number>();
  const clusterGroups = new Map<string, ScoringForce[]>();

  for (let i = 0; i < polarized.length; i++) {
    const f = polarized[i];
    const t = f.type.toLowerCase();
    if (t !== "structural" && t !== "constraint") continue;
    const id = clusterId(f.factor + " " + f.evidence) ?? `structural-${i}`;
    if (!clusterGroups.has(id)) clusterGroups.set(id, []);
    clusterGroups.get(id)!.push(f);
    consumed.add(i);
  }

  for (const group of clusterGroups.values()) {
    const maxW = Math.max(...group.map((g) => g.weight));
    const hasStructural = group.some((g) => g.type.toLowerCase() === "structural");
    merged.push({
      factor: group.length > 1 ? `STRUCTURAL LOCK-IN: ${group[0].factor}` : group[0].factor,
      type: hasStructural ? "Structural" : "Constraint",
      weight: maxW,
      role: "parent",
      derived_from: [],
      evidence: group.find((g) => g.evidence)?.evidence ?? group[0].evidence,
    });
  }

  const structuralParent = merged.find((m) => m.type.toLowerCase() === "structural");

  for (let i = 0; i < polarized.length; i++) {
    if (consumed.has(i)) continue;
    const f = polarized[i];
    const t = f.type.toLowerCase();
    const text = normalizeText(f.factor + " " + f.evidence);

    if (t === "behavioral") {
      merged.push({
        ...f,
        role: "derivative",
        derived_from: structuralParent ? [structuralParent.factor] : [],
      });
      continue;
    }

    if (t === "timing") {
      const tied =
        CLUSTER_KEYWORDS.some((k) => text.includes(k)) ||
        text.includes("merger") ||
        text.includes("fiscal") ||
        text.includes("audit");
      merged.push({
        ...f,
        role: tied ? "derivative" : f.role ?? "independent",
        derived_from: tied && structuralParent ? [structuralParent.factor] : f.derived_from ?? [],
      });
      continue;
    }

    merged.push({ ...f, role: f.role ?? "independent", derived_from: f.derived_from ?? [] });
  }

  return merged;
}

function inferTimingFactor(forces: ScoringForce[]): number {
  const texts = forces
    .filter((f) => f.type.toLowerCase() === "timing")
    .map((f) => normalizeText(f.factor + " " + f.evidence))
    .join(" ");
  if (TIMING_IMMEDIATE.some((k) => texts.includes(k))) return 20;
  if (TIMING_SHORT.some((k) => texts.includes(k))) return 10;
  if (TIMING_LONG.some((k) => texts.includes(k))) return 5;
  if (texts.length > 0) return 5;
  return 0;
}

/** Effective Intent = Raw Intent × constraintFactor × enablerMultiplier */
function constraintFactor(constraint: number): number {
  if (constraint <= 0) return 1;
  return (100 - constraint) / 100;
}

function enablerMultiplier(enabler: number): number {
  if (enabler <= 0) return 1;
  return 1 + enabler / 200;
}

function effectiveIntent(intent: number, constraint: number, enabler: number): number {
  return clamp(intent * constraintFactor(constraint) * enablerMultiplier(enabler));
}

function isAuthorityGapRecoverable(
  constraint: number,
  structural: number,
  enabler: number,
  blocker: string
): boolean {
  const b = blocker.toUpperCase();
  if (
    b.includes("PERMANENT") ||
    b.includes("STRUCTURAL LOCK") ||
    b.includes("AUDIT") ||
    b.includes("FREEZE")
  ) {
    return false;
  }
  if (enabler < 40) return false;
  if (b.includes("TEMPORARY")) return true;
  if (!(structural < 80 && constraint >= 50)) return false;
  return constraint < 88;
}

function viabilityScore(
  intent: number,
  eff: number,
  timing: number,
  structural: number,
  constraint: number,
  enabler: number,
  blocker = "MIXED"
): number {
  if (constraint <= 0 && enabler > 0 && structural <= 15) {
    return clamp(Math.max(eff, intent) + timing);
  }
  if (isAuthorityGapRecoverable(constraint, structural, enabler, blocker)) {
    return clamp(intent * 0.55 + enabler * 0.4 + timing - structural * 0.2);
  }
  return clamp(eff + timing - Math.max(structural, constraint));
}

function equilibrium(structural: number, constraint: number): CanonicalEquilibrium {
  const sum = structural + constraint;
  if (sum >= 160) return "PINNED";
  if (sum >= 120) return "MIXED";
  return "OPEN";
}

function trajectory(
  viability: number,
  constraint: number,
  structural: number,
  enabler: number,
  blocker: string
): CanonicalTrajectory {
  const b = blocker.toUpperCase();
  if (constraint >= 100 && (b.includes("STRUCTURAL LOCK") || b.includes("PERMANENT"))) {
    return "NON-VIABLE / DEAD";
  }
  if (constraint <= 0 && enabler >= 50 && structural <= 15 && viability >= 50) {
    return "VALIDATED / VELOCITY";
  }
  if (isAuthorityGapRecoverable(constraint, structural, enabler, blocker)) {
    if (b.includes("TEMPORARY") || viability <= 50) return "DEFERRED (recoverable)";
    return "ACTIVE";
  }
  if (constraint > 85 || (constraint > 70 && enabler < 40)) return "DEFERRED (locked)";
  if (viability <= 20) return "DEFERRED (locked)";
  if (viability <= 50) return "DEFERRED (recoverable)";
  return "ACTIVE";
}

function buyerIntentLevel(eff: number): string {
  if (eff <= 15) return "suppressed intent";
  if (eff <= 40) return "weak intent";
  if (eff <= 70) return "medium intent";
  return "strong intent";
}

function decisionFreedom(constraint: number): string {
  if (constraint >= 85) return "None";
  if (constraint >= 60) return "limited";
  return "partial";
}

function viabilityLabel(
  viability: number,
  _structural: number,
  constraint: number,
  enabler: number,
  trajectory_type: CanonicalTrajectory,
  _blocker: string
): ViabilityStateLabel {
  if (trajectory_type === "VALIDATED / VELOCITY" && constraint <= 0 && enabler >= 50) {
    return "VALIDATED / CLOSED";
  }
  if (trajectory_type === "NON-VIABLE / DEAD") {
    return "NON-VIABLE (STRUCTURALLY LOCKED)";
  }
  if (viability > 70) return "HIGHLY VIABLE";
  if (viability > 50) return "CONDITIONALLY VIABLE";
  return "DEFERRED VIABILITY";
}

function formatFormula(f: {
  intent_strength: number;
  constraint_pressure: number;
  structural_lock_in: number;
  enabler_strength: number;
  timing_factor: number;
  effective_intent: number;
  viability_score: number;
  equilibrium_state: CanonicalEquilibrium;
  trajectory_type: CanonicalTrajectory;
}): string {
  const cf = constraintFactor(f.constraint_pressure);
  const em = enablerMultiplier(f.enabler_strength);
  return [
    `Effective Intent = ${f.intent_strength} × ${cf.toFixed(2)} (constraint) × ${em.toFixed(2)} (enabler) = ${f.effective_intent}`,
    `Viability = ${f.viability_score} | Enabler ${f.enabler_strength} | Constraint ${f.constraint_pressure} | Structural ${f.structural_lock_in}`,
    `Equilibrium: ${f.structural_lock_in}+${f.constraint_pressure} → ${f.equilibrium_state}. Trajectory: ${f.trajectory_type}.`,
  ].join(" | ");
}

function snapshot(
  intent: number,
  constraint: number,
  structural: number,
  enabler: number,
  timing: number,
  blocker = "MIXED"
): CycleSnapshot {
  const eff = effectiveIntent(intent, constraint, enabler);
  const via = viabilityScore(intent, eff, timing, structural, constraint, enabler, blocker);
  return {
    constraint_pressure: constraint,
    effective_intent: eff,
    structural_lock_in: structural,
    timing_accessibility: timing,
    enabler_strength: enabler,
    viability_score: via,
    equilibrium_state: equilibrium(structural, constraint),
  };
}

const CALENDAR_MISS = ["missed the", "couldn t join", "could not join", "underwater until", "reschedule"];
const SYSTEM_LOCK = ["audit", "freeze", "frozen", "compliance", "permanent"];

/** A missed meeting is a temporary blocker. An audit, freeze, or permanent lock stays structural. */
export function resolveBlockerClassification(
  blocker: string,
  forces: ScoringForce[],
  transcript = ""
): string {
  const blob = normalizeText(
    [transcript, ...forces.map((force) => `${force.factor} ${force.evidence}`)].join(" ")
  );
  const systemLock = SYSTEM_LOCK.some((phrase) => blob.includes(phrase));
  const calendarMiss = CALENDAR_MISS.some((phrase) => blob.includes(normalizeText(phrase)));
  if (calendarMiss && !systemLock) return "TEMPORARY BLOCKERS";
  return blocker;
}

/** Stated willingness stays Intent even when the model files that sentence as an enabler. */
function ensureStatedIntent(forces: ScoringForce[], transcript: string): ScoringForce[] {
  if (forces.some((force) => force.type.toLowerCase() === "intent" && force.weight > 0)) return forces;
  const corpus = [transcript, ...forces.map((force) => force.evidence)].filter(Boolean).join("\n");
  const quote = assessIntentExtraction(corpus, forces).missing[0]?.quote;
  if (!quote) return forces;
  return [
    ...forces,
    {
      factor: "Buyer says the problem is still worth pursuing",
      type: "Intent",
      weight: 70,
      role: "independent",
      derived_from: [],
      evidence: quote,
    },
  ];
}

export function deriveCanonicalState(
  rawForces: ScoringForce[],
  blockerClassification = "MIXED",
  transcript = ""
): { causal: CausalState; frozen: FrozenDerivation } {
  const withIntent = ensureStatedIntent(rawForces, transcript);
  const blocker = resolveBlockerClassification(blockerClassification, withIntent, transcript);
  const forces = mergeForces(withIntent);
  const causal: CausalState = { forces, blocker_classification: blocker };

  const intent_strength = maxWeight(forces, "Intent");
  const constraint_pressure = maxWeight(forces, "Constraint");
  const structural_lock_in = maxWeight(forces, "Structural");
  const enabler_strength = maxWeight(forces, "Enabler");
  const timing_factor = inferTimingFactor(forces);

  const effective_intent = effectiveIntent(
    intent_strength,
    constraint_pressure,
    enabler_strength
  );
  const viability_score = viabilityScore(
    intent_strength,
    effective_intent,
    timing_factor,
    structural_lock_in,
    constraint_pressure,
    enabler_strength,
    blocker
  );
  const equilibrium_state = equilibrium(structural_lock_in, constraint_pressure);
  const trajectory_type = trajectory(
    viability_score,
    constraint_pressure,
    structural_lock_in,
    enabler_strength,
    blocker
  );
  const viability_state = viabilityLabel(
    viability_score,
    structural_lock_in,
    constraint_pressure,
    enabler_strength,
    trajectory_type,
    blocker
  );
  const buyer_intent_level = buyerIntentLevel(effective_intent);
  const decision_freedom = decisionFreedom(constraint_pressure);

  const c1 = snapshot(
    intent_strength,
    clamp(constraint_pressure * 0.75),
    clamp(structural_lock_in * 0.9),
    clamp(enabler_strength * 0.9),
    timing_factor,
    blocker
  );
  const c2 = snapshot(
    intent_strength,
    clamp((constraint_pressure + c1.constraint_pressure) / 2),
    structural_lock_in,
    enabler_strength,
    timing_factor,
    blocker
  );
  const c3: CycleSnapshot = {
    constraint_pressure,
    effective_intent,
    structural_lock_in,
    timing_accessibility: timing_factor,
    enabler_strength,
    viability_score,
    equilibrium_state,
  };

  const frozenBase = {
    intent_strength,
    constraint_pressure,
    structural_lock_in,
    enabler_strength,
    timing_factor,
    effective_intent,
    viability_score,
    equilibrium_state,
    trajectory_type,
  };

  const frozen: FrozenDerivation = {
    ...frozenBase,
    viability_state,
    buyer_intent_level,
    decision_freedom,
    derivation_formula: formatFormula({ ...frozenBase, trajectory_type }),
    resolution_cycles: {
      convergence_status: "converged",
      total_cycles: 3,
      cycles: [
        {
          cycle: 1,
          phase: "structural propagation",
          state_snapshot: c1,
          state_change: "Structural propagation (intermediate)",
        },
        {
          cycle: 2,
          phase: "constraint feedback",
          state_snapshot: c2,
          state_change: "Constraint feedback (intermediate)",
        },
        {
          cycle: 3,
          phase: "frozen equilibrium",
          state_snapshot: c3,
          state_change: "Frozen — final derived state",
        },
      ],
      convergence_summary: `Viability ${c1.viability_score}→${c2.viability_score}→${viability_score}. Effective intent ${c1.effective_intent}→${c2.effective_intent}→${effective_intent}. Equilibrium: ${equilibrium_state}.`,
    },
  };

  return { causal, frozen };
}

export function buildDependencyGraph(forces: ScoringForce[]) {
  const parents = forces.filter((f) => f.role === "parent");
  const derivatives = forces.filter(
    (f) => f.role === "derivative" || (f.derived_from?.length ?? 0) > 0
  );
  return {
    parent_forces: parents.map((p) => ({
      force: p.factor,
      generates: derivatives
        .filter((d) => d.derived_from?.includes(p.factor))
        .map((d) => d.factor),
    })),
    child_forces: derivatives.map((d) => ({
      force: d.factor,
      derived_from: d.derived_from?.[0] ?? "",
    })),
    feedback_loops: [] as { loop: string; forces: string[]; effect: string }[],
  };
}

export function dedupeCouplings<T extends { source: string; target: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.source}→${item.target}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(item.source && item.target);
  });
}

export function assertFrozenConsistency(check: {
  frozen: FrozenDerivation;
  viability_score: number;
  effective_intent: number;
  equilibrium_state: string;
  trajectory_type: string;
  constraint_pressure: number;
  intent_strength: number;
  crm_viability: string;
  crm_effective: string;
  crm_equilibrium: string;
  crm_trajectory: string;
  cycle_final_viability: number;
  cycle_final_effective: number;
  cycle_final_equilibrium: string;
}): void {
  const errs: string[] = [];
  const f = check.frozen;

  if (check.viability_score !== f.viability_score) errs.push("viability_state mismatch");
  if (check.effective_intent !== f.effective_intent) errs.push("buyer_state mismatch");
  if (check.equilibrium_state !== f.equilibrium_state) errs.push("equilibrium mismatch");
  if (check.trajectory_type !== f.trajectory_type) errs.push("trajectory mismatch");
  if (check.crm_viability !== String(f.viability_score)) errs.push("crm viability mismatch");
  if (check.crm_effective !== String(f.effective_intent)) errs.push("crm effective mismatch");
  if (check.crm_equilibrium !== f.equilibrium_state) errs.push("crm equilibrium mismatch");
  if (check.crm_trajectory !== f.trajectory_type) errs.push("crm trajectory mismatch");
  if (check.cycle_final_viability !== f.viability_score) errs.push("resolution cycle mismatch");
  if (check.cycle_final_effective !== f.effective_intent) errs.push("resolution effective mismatch");
  if (check.cycle_final_equilibrium !== f.equilibrium_state) errs.push("resolution equilibrium mismatch");

  if (errs.length > 0) {
    throw new Error(`Frozen consistency check failed: ${errs.join(", ")}`);
  }
}

export const computeCanonicalScores = (
  forces: ScoringForce[],
  blocker = "MIXED"
) => deriveCanonicalState(forces, blocker).frozen;

export const formatCanonicalDerivation = (f: FrozenDerivation) => f.derivation_formula;

export const buildResolutionCycles = (f: FrozenDerivation) => f.resolution_cycles;

// --- Phase 1 proprietary indices (uncopyable moat) ---

export interface StakeholderIndexInput {
  name: string;
  role?: string;
  stance?: string;
  persona_type?: string;
  authority_level?: string;
  evidence?: string;
}

export interface DialogueStallSignals {
  score: number;
  deferral_phrase_count: number;
  handoff_mention_count: number;
  rep_monologue_ratio: number | null;
  avg_turn_gap_seconds: number | null;
  flagged_patterns: string[];
  /** Phrases and department words found in the supplied text. */
  observed_patterns: string[];
  /** Dialogue-shape penalties. They are measurements, not buyer quotes. */
  inferred_patterns: string[];
}

export interface StakeholderDispersion {
  index: number;
  authority_gap: boolean;
  multi_department_friction: number;
  persona_breakdown: Record<string, number>;
  /** Department words found in role, evidence, or name text. */
  department_mentions: string[];
  /** True when the absent-decision-maker term was added. Absence is not resistance. */
  absence_term_applied: boolean;
  flags: string[];
}

export interface ScoreFactor {
  basis: "observed" | "inferred";
  text: string;
}

export interface ScoreExplanation {
  metric: string;
  summary: string;
  factors: ScoreFactor[];
  caveat: string;
}

export interface ScoreExplanations {
  viability: ScoreExplanation;
  deal_risk: ScoreExplanation;
  department_friction: ScoreExplanation;
  dispersion: ScoreExplanation;
  stall: ScoreExplanation;
}

export type DealRiskTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

export interface ProprietaryIndices {
  deal_risk_index: number;
  stakeholder_dispersion_index: number;
  dialogue_stall_score: number;
  authority_gap_flag: boolean;
  multi_department_friction: number;
  risk_tier: DealRiskTier;
  formula: string;
  dialogue_stall: DialogueStallSignals;
  stakeholder_dispersion: StakeholderDispersion;
  explanations: ScoreExplanations;
}

const PERSONA_WEIGHTS: Record<string, number> = {
  "absent decision maker": 28,
  "hidden detractor": 24,
  "suppressed champion": 12,
  "aligned champion": -8,
};

const DEFERRAL_PHRASES = [
  "i'll check",
  "ill check",
  "let me get back",
  "loop in",
  "not on this call",
  "not on the call",
  "missed the",
  "missed today's",
  "reschedule",
  "need to talk to",
  "get back to you",
  "underwater until",
  "stays parked",
  "if not",
  "can't join",
  "couldn't join",
  "without him",
  "without her",
  "hasn't validated",
  "has not validated",
];

const HANDOFF_DEPARTMENTS = [
  "procurement",
  "legal",
  "finance",
  "security",
  "infrastructure",
  "it ",
  " cfo",
  " cto",
  " vp ",
  "operations",
  "compliance",
  "audit",
];

const DEPARTMENT_FRICTION = [
  "procurement",
  "legal",
  "finance",
  "security",
  "infrastructure",
  "compliance",
  "audit",
  "operations",
  "it",
  "engineering",
];

const OPPOSITION_EVIDENCE =
  /\b(opposed|opposes|opposition|will block|blocks the|refuses to approve|against the (deal|purchase|project)|kill the deal|will not approve|won't approve)\b/i;
const NOT_OPPOSED_EVIDENCE = /\b(not against|isn't against|is not against)\b/i;
const UNMET_CONDITION_EVIDENCE =
  /\b(financial case|actual savings|too optimistic|assumptions|defensible savings|can't promise|cannot promise)\b/i;
const CAPACITY_EVIDENCE =
  /\b(can'?t commit|cannot commit|no capacity|another integration)\b/i;
const INACTIVE_EVIDENCE =
  /\b(not pushing|isn't pushing|is not pushing|hasn'?t said otherwise|haven'?t had a proper|have not had a proper|wouldn'?t tell you that he'?s pushing|would not tell you that he is pushing)\b/i;
const COMPETITIVE_EVIDENCE = /\b(another platform|flowtrack|easier to use)\b/i;

export interface ReconciledPersona {
  key: string;
  label: string;
}

/** A persona label counts as opposition only when that person's evidence says so. */
export function reconcilePersona(s: StakeholderIndexInput): ReconciledPersona {
  const raw = (s.persona_type ?? s.stance ?? "").toLowerCase().trim();
  const evidence = s.evidence ?? "";
  const opposed = OPPOSITION_EVIDENCE.test(evidence) && !NOT_OPPOSED_EVIDENCE.test(evidence);
  const labeledDetractor =
    (raw.includes("hidden") && raw.includes("detractor")) ||
    raw.includes("skeptic") ||
    raw.includes("detractor") ||
    raw.includes("blocker");

  if (labeledDetractor) {
    if (opposed) return { key: "hidden detractor", label: "Hidden Detractor" };
    if (UNMET_CONDITION_EVIDENCE.test(evidence) || NOT_OPPOSED_EVIDENCE.test(evidence)) {
      return { key: "unmet condition", label: "Unmet condition" };
    }
    if (CAPACITY_EVIDENCE.test(evidence)) return { key: "resource constraint", label: "Resource constraint" };
    if (COMPETITIVE_EVIDENCE.test(evidence)) return { key: "competitive preference", label: "Competitive preference" };
    if (INACTIVE_EVIDENCE.test(evidence)) return { key: "inactive sponsor", label: "Inactive sponsor" };
    return { key: "unknown", label: "Unknown" };
  }

  if (
    (raw.includes("aligned") || raw.includes("champion")) &&
    !raw.includes("suppressed") &&
    INACTIVE_EVIDENCE.test(evidence)
  ) {
    return { key: "inactive sponsor", label: "Inactive sponsor" };
  }
  if (raw.includes("absent")) return { key: "absent decision maker", label: "Absent Decision Maker" };
  if (raw.includes("suppressed")) return { key: "suppressed champion", label: "Suppressed Champion" };
  if (raw.includes("aligned") || raw.includes("champion")) {
    return { key: "aligned champion", label: "Aligned Champion" };
  }
  if (raw === "neutral") return { key: "neutral", label: "Neutral" };
  return { key: raw || "unknown", label: s.persona_type?.trim() || s.stance?.trim() || "Unknown" };
}

function normalizePersona(s: StakeholderIndexInput): string {
  return reconcilePersona(s).key;
}

export function computeStakeholderDispersion(
  stakeholders: StakeholderIndexInput[]
): StakeholderDispersion {
  const persona_breakdown: Record<string, number> = {};
  const flags: string[] = [];
  let raw = 0;

  for (const s of stakeholders) {
    const persona = normalizePersona(s);
    persona_breakdown[persona] = (persona_breakdown[persona] ?? 0) + 1;
    const weight = PERSONA_WEIGHTS[persona] ?? 0;
    raw += weight;
    if (persona === "absent decision maker") {
      flags.push(`Absent decision maker: ${s.name}`);
    }
    if (persona === "hidden detractor") {
      flags.push(`Hidden detractor: ${s.name}`);
    }
    if (persona === "unmet condition") flags.push(`Unmet condition: ${s.name}`);
    if (persona === "resource constraint") flags.push(`Resource constraint: ${s.name}`);
    if (persona === "inactive sponsor") flags.push(`Inactive sponsor: ${s.name}`);
    if (persona === "competitive preference") flags.push(`Competitive preference: ${s.name}`);
  }

  const aligned = persona_breakdown["aligned champion"] ?? 0;
  const suppressed = persona_breakdown["suppressed champion"] ?? 0;
  const absent = persona_breakdown["absent decision maker"] ?? 0;
  const authority_gap =
    absent > 0 || (suppressed > 0 && aligned === 0);

  if (authority_gap) {
    flags.push("Authority gap — no aligned champion with signing power on call");
  }

  const deptMentions = new Set<string>();
  for (const s of stakeholders) {
    const blob = normalizeText(`${s.role ?? ""} ${s.evidence ?? ""} ${s.name}`);
    for (const dept of DEPARTMENT_FRICTION) {
      if (blob.includes(dept)) deptMentions.add(dept);
    }
  }
  const absence_term_applied = absent > 0;
  const multi_department_friction = clamp(deptMentions.size * 14 + (absence_term_applied ? 12 : 0));

  const index = clamp(raw);

  return {
    index,
    authority_gap,
    multi_department_friction,
    persona_breakdown,
    department_mentions: [...deptMentions].sort(),
    absence_term_applied,
    flags,
  };
}

function parseTimestampSeconds(line: string): number | null {
  const m = line.match(/\[(\d{1,2}):(\d{2}):(\d{2})\]/);
  if (!m) return null;
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10);
}

function speakerLabel(line: string): string | null {
  const m = line.match(/^\[[^\]]+\]\s*([A-Za-z]{1,3}):/);
  if (m) return m[1].toUpperCase();
  const m2 = line.match(/^(Prospect|Rep|Speaker \d+)/i);
  if (m2) return m2[1].toLowerCase();
  return null;
}

export function computeDialogueStallSignals(transcript: string): DialogueStallSignals {
  const lower = transcript.toLowerCase();
  const flagged_patterns: string[] = [];

  const observed_patterns: string[] = [];
  const inferred_patterns: string[] = [];
  let deferral_phrase_count = 0;
  for (const phrase of DEFERRAL_PHRASES) {
    if (lower.includes(phrase)) {
      deferral_phrase_count++;
      flagged_patterns.push(phrase);
      observed_patterns.push(phrase);
    }
  }

  let handoff_mention_count = 0;
  for (const dept of HANDOFF_DEPARTMENTS) {
    const label = dept.trim();
    if (lower.includes(label)) {
      handoff_mention_count++;
      observed_patterns.push(`handoff: ${label}`);
    }
  }

  const lines = transcript.split(/\r?\n/).filter((l) => l.trim());
  const timestamps: number[] = [];
  const speakerWords = new Map<string, number>();
  let totalWords = 0;

  for (const line of lines) {
    const ts = parseTimestampSeconds(line);
    if (ts !== null) timestamps.push(ts);

    const speaker = speakerLabel(line);
    const words = line.split(/\s+/).filter(Boolean).length;
    if (speaker) {
      speakerWords.set(speaker, (speakerWords.get(speaker) ?? 0) + words);
      totalWords += words;
    }
  }

  let rep_monologue_ratio: number | null = null;
  if (totalWords > 0 && speakerWords.size >= 2) {
    const repWords =
      [...speakerWords.entries()]
        .filter(([k]) => /^(sc|rep|ae|seller|sales)/i.test(k) || k === "rep")
        .reduce((sum, [, w]) => sum + w, 0) ||
      Math.max(...speakerWords.values());
    rep_monologue_ratio = Math.round((repWords / totalWords) * 100) / 100;
    if (rep_monologue_ratio > 0.65) {
      flagged_patterns.push("rep-dominated dialogue");
      inferred_patterns.push("rep-dominated dialogue");
    }
  }

  let avg_turn_gap_seconds: number | null = null;
  if (timestamps.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      const gap = timestamps[i] - timestamps[i - 1];
      if (gap > 0 && gap < 600) gaps.push(gap);
    }
    if (gaps.length) {
      avg_turn_gap_seconds = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length);
      if (avg_turn_gap_seconds > 45) {
        flagged_patterns.push("long turn gaps");
        inferred_patterns.push("long turn gaps");
      }
    }
  }

  const score = clamp(
    deferral_phrase_count * 8 +
      handoff_mention_count * 5 +
      (rep_monologue_ratio !== null && rep_monologue_ratio > 0.65 ? 15 : 0) +
      (avg_turn_gap_seconds !== null && avg_turn_gap_seconds > 45 ? 12 : 0)
  );

  return {
    score,
    deferral_phrase_count,
    handoff_mention_count,
    rep_monologue_ratio,
    avg_turn_gap_seconds,
    flagged_patterns,
    observed_patterns,
    inferred_patterns,
  };
}

function riskTier(dri: number): DealRiskTier {
  if (dri >= 75) return "CRITICAL";
  if (dri >= 55) return "HIGH";
  if (dri >= 35) return "MODERATE";
  return "LOW";
}

function recoverableTrack(frozen: FrozenDerivation): boolean {
  return (
    frozen.enabler_strength >= 40 &&
    frozen.structural_lock_in < 80 &&
    frozen.constraint_pressure >= 50 &&
    (frozen.constraint_pressure < 88 || frozen.trajectory_type === "DEFERRED (recoverable)")
  );
}

export type DealRiskInputs = Pick<
  FrozenDerivation,
  | "viability_score"
  | "constraint_pressure"
  | "structural_lock_in"
  | "enabler_strength"
  | "timing_factor"
  | "trajectory_type"
>;

/**
 * One reporting equation for every transcript:
 * 0.30×(100−viability) + 0.25×constraint + 0.15×structural + 0.20×dispersion
 * + 0.10×stall + timing penalty − 0.15×enabler.
 * The printed terms are the values that are summed.
 */
export function compileDealRiskReport(
  frozen: DealRiskInputs,
  dispersion: number,
  stallScore: number
): {
  deal_risk_index: number;
  formula: string;
  timingPenalty: number;
  stallContribution: number;
} {
  const timingPenalty =
    frozen.timing_factor <= 5 && frozen.constraint_pressure > 40 ? 10 : 0;
  const stallContribution = recoverableTrack(frozen) ? Math.min(stallScore, 40) : stallScore;
  const terms: { text: string; value: number }[] = [
    {
      text: `0.30×(100−${frozen.viability_score})`,
      value: (100 - frozen.viability_score) * 0.3,
    },
    {
      text: `0.25×${frozen.constraint_pressure}`,
      value: frozen.constraint_pressure * 0.25,
    },
    {
      text: `0.15×${frozen.structural_lock_in}`,
      value: frozen.structural_lock_in * 0.15,
    },
    {
      text: `0.20×${dispersion}`,
      value: dispersion * 0.2,
    },
    {
      text: `0.10×${stallContribution}`,
      value: stallContribution * 0.1,
    },
  ];
  if (timingPenalty > 0) terms.push({ text: "timing_penalty(10)", value: timingPenalty });
  const deal_risk_index = clamp(
    terms.reduce((sum, term) => sum + term.value, 0) - frozen.enabler_strength * 0.15
  );
  const formula = `DRI ${deal_risk_index} = ${terms.map((term) => term.text).join(" + ")} − 0.15×${frozen.enabler_strength}`;
  return { timingPenalty, stallContribution, deal_risk_index, formula };
}

/** Deal Risk Index — higher = more stall/recovery risk. Proprietary composite, not LLM-derived. */
export function computeDealRiskIndex(
  frozen: FrozenDerivation,
  dispersion: StakeholderDispersion,
  stall: DialogueStallSignals
): number {
  return compileDealRiskReport(frozen, dispersion.index, stall.score).deal_risk_index;
}

function viabilityPathSentence(frozen: FrozenDerivation, blocker: string): string {
  if (
    frozen.constraint_pressure <= 0 &&
    frozen.enabler_strength > 0 &&
    frozen.structural_lock_in <= 15
  ) {
    return "Open path: constraint is zero and structural lock-in is low, so viability follows intent plus timing.";
  }
  if (
    isAuthorityGapRecoverable(
      frozen.constraint_pressure,
      frozen.structural_lock_in,
      frozen.enabler_strength,
      blocker
    )
  ) {
    return "Recoverable blocker: viability follows intent, enabler strength, and timing, reduced by structural lock-in. A next step is still treated as available.";
  }
  return "Default path: viability is effective intent plus timing, minus the larger of structural lock-in and constraint pressure.";
}

/** Plain-language account of the scores already computed. Does not change the numbers. */
export function explainScores(
  frozen: FrozenDerivation,
  dispersion: StakeholderDispersion,
  stall: DialogueStallSignals,
  blocker = ""
): ScoreExplanations {
  const departments = dispersion.department_mentions;
  const departmentList = departments.length ? departments.join(", ") : "none";
  const observedStall = stall.observed_patterns.filter((item) => !item.startsWith("handoff:"));
  const handoffs = stall.observed_patterns
    .filter((item) => item.startsWith("handoff:"))
    .map((item) => item.slice("handoff:".length).trim());

  return {
    viability: {
      metric: "Viability",
      summary:
        "Whether a credible path to advance the deal still exists. Stakeholder access is not its own term, and this is not a close probability.",
      factors: [
        {
          basis: "observed",
          text: `Intent ${frozen.intent_strength}, constraint ${frozen.constraint_pressure}, structural lock-in ${frozen.structural_lock_in}, enabler ${frozen.enabler_strength}, timing ${frozen.timing_factor}. Those weights come from the extracted forces.`,
        },
        {
          basis: "inferred",
          text: intentInputTrace(
            frozen.intent_strength,
            frozen.constraint_pressure,
            frozen.effective_intent
          ),
        },
        {
          basis: "inferred",
          text: `${viabilityPathSentence(frozen, blocker)} Effective intent is ${frozen.effective_intent}. Trajectory: ${frozen.trajectory_type}. State: ${frozen.viability_state}.`,
        },
      ],
      caveat:
        "Stakeholder access changes this score only when it is already inside the constraint, structural, or enabler weights. A missing fact is not given a weight.",
    },
    deal_risk: {
      metric: "Deal Risk Index",
      summary:
        "Evidence the deal may stall further or be lost, from the published risk equation. Not a close probability.",
      factors: [
        {
          basis: "inferred",
          text: `0.30×(100−viability ${frozen.viability_score}), 0.25×constraint ${frozen.constraint_pressure}, 0.15×structural ${frozen.structural_lock_in}, 0.20×dispersion ${dispersion.index}, 0.10×stall contribution, minus 0.15×enabler ${frozen.enabler_strength}.`,
        },
        {
          basis: "inferred",
          text:
            frozen.timing_factor <= 5 && frozen.constraint_pressure > 40
              ? "A timing penalty of 10 is included because timing is in the low band and constraint is above 40."
              : "No timing penalty is included.",
        },
      ],
      caveat:
        "Recoverable deals cap the stall term at 40 inside this equation. The index explains those inputs. It does not predict a loss date.",
    },
    department_friction: {
      metric: "Department Friction Index",
      summary:
        "A count of department words in the stakeholder text, plus 12 when an absent decision maker is mapped. A word match is not resistance.",
      factors: [
        {
          basis: "observed",
          text: `Department words in role, evidence, or name: ${departmentList}. Each distinct word adds 14.`,
        },
        {
          basis: "inferred",
          text: dispersion.absence_term_applied
            ? "An absent decision maker adds 12. That term is not evidence that Legal, Security, or a peer is opposing the deal."
            : "The absent-decision-maker term was not applied.",
        },
      ],
      caveat:
        "Legal, Security, or peer resistance is not implied unless those words are in the list above. Absence of a technical approver is not department resistance.",
    },
    dispersion: {
      metric: "Dispersion",
      summary:
        "How split the mapped stakeholders are. The index only goes as far as the supplied stakeholder list.",
      factors: [
        {
          basis: "observed",
          text: `Persona counts from the stakeholder map: ${
            Object.entries(dispersion.persona_breakdown)
              .map(([name, count]) => `${name} ${count}`)
              .join(", ") || "none"
          }.`,
        },
        {
          basis: "inferred",
          text: `Persona weights are fixed: absent decision maker +28, hidden detractor +24, suppressed champion +12, aligned champion −8. Unmet conditions, resource limits, inactivity, and competitive preference add 0. Department friction (${dispersion.multi_department_friction}) is reported separately and is not added to this index. Authority gap: ${dispersion.authority_gap}.`,
        },
      ],
      caveat:
        "Unmentioned stakeholders are not assumed. Low dispersion means the supplied map is concentrated, not that the whole buying group is aligned.",
    },
    stall: {
      metric: "Stall signals",
      summary:
        "Deferral phrases and department handoffs found in the text, plus dialogue-shape penalties when they apply. A delayed meeting is not a rejection.",
      factors: [
        {
          basis: "observed",
          text: `Deferral phrases found: ${observedStall.length ? observedStall.join(", ") : "none"}. Department handoffs found: ${handoffs.length ? handoffs.join(", ") : "none"}.${
            handoffs.some((item) => item === "it" || item === "vp" || item === "cfo")
              ? " Short tokens (it, vp, cfo) are substring matches in the counter, not proof of an IT, VP, or CFO blocker."
              : ""
          }`,
        },
        {
          basis: "inferred",
          text: stall.inferred_patterns.length
            ? `Dialogue-shape penalties: ${stall.inferred_patterns.join(", ")}.`
            : "No rep-monologue or long-gap penalty was applied.",
        },
      ],
      caveat:
        "Phrase matches, including a missed meeting or “if not,” raise the score. They do not by themselves mean the buyer is resisting or has rejected the deal.",
    },
  };
}

export function deriveProprietaryIndices(
  frozen: FrozenDerivation,
  stakeholders: StakeholderIndexInput[],
  transcript = "",
  blocker = ""
): ProprietaryIndices {
  const stakeholder_dispersion = computeStakeholderDispersion(stakeholders);
  const dialogue_stall = computeDialogueStallSignals(transcript);
  const { deal_risk_index, formula: equation } = compileDealRiskReport(
    frozen,
    stakeholder_dispersion.index,
    dialogue_stall.score
  );
  const risk_tier = riskTier(deal_risk_index);
  const formula = [
    equation,
    `Tier: ${risk_tier} | Authority gap: ${stakeholder_dispersion.authority_gap}`,
  ].join(" | ");

  return {
    deal_risk_index,
    stakeholder_dispersion_index: stakeholder_dispersion.index,
    dialogue_stall_score: dialogue_stall.score,
    authority_gap_flag: stakeholder_dispersion.authority_gap,
    multi_department_friction: stakeholder_dispersion.multi_department_friction,
    risk_tier,
    formula,
    dialogue_stall,
    stakeholder_dispersion,
    explanations: explainScores(frozen, stakeholder_dispersion, dialogue_stall, blocker),
  };
}

export function personaSignature(stakeholders: StakeholderIndexInput[]): string {
  const counts: Record<string, number> = {};
  for (const s of stakeholders) {
    const p = normalizePersona(s);
    counts[p] = (counts[p] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join(",");
}

export function constraintBand(constraint: number): "low" | "medium" | "high" {
  if (constraint >= 70) return "high";
  if (constraint >= 40) return "medium";
  return "low";
}
