/**
 * Three-layer deterministic compiler:
 *   Layer 1 — CausalState (inputs only)
 *   Layer 2 — FrozenDerivation (single derivation pass)
 *   Layer 3 — Output projection (read-only, no math)
 */

export type CanonicalEquilibrium = "STABLE" | "MIXED" | "UNSTABLE";

export type CanonicalTrajectory =
  | "DEFERRED (locked)"
  | "DEFERRED (recoverable)"
  | "ACTIVE";

export type ViabilityStateLabel =
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

/** Layer 1 — inputs only, no derived scores */
export interface CausalState {
  forces: ScoringForce[];
  blocker_classification: string;
}

export interface CycleSnapshot {
  constraint_pressure: number;
  effective_intent: number;
  structural_lock_in: number;
  timing_accessibility: number;
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

/** Layer 2 — frozen after single derivation pass; immutable downstream */
export interface FrozenDerivation {
  intent_strength: number;
  constraint_pressure: number;
  structural_lock_in: number;
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

function maxWeight(forces: ScoringForce[], type: string): number {
  const weights = forces
    .filter((f) => f.type.toLowerCase() === type.toLowerCase())
    .map((f) => f.weight);
  return weights.length ? Math.max(...weights) : 0;
}

const CLUSTER_KEYWORDS = [
  "contract", "vendor", "commitment", "signed", "salesforce", "capex",
  "allocation", "implementation", "deployment", "integration", "acquisition",
  "merger", "procurement", "budget", "board",
];

const TIMING_IMMEDIATE = ["immediate", "now", "asap", "this quarter", "right away"];
const TIMING_SHORT = ["30", "60", "90", "weeks", "short-term", "near-term"];
const TIMING_LONG = ["fiscal", "6 month", "12 month", "long-term", "year", "annual"];

function clusterId(text: string): string | null {
  const t = normalizeText(text);
  for (const k of CLUSTER_KEYWORDS) {
    if (t.includes(k)) return k;
  }
  return null;
}

export function mergeForces(forces: ScoringForce[]): ScoringForce[] {
  if (!forces.length) return forces;

  const merged: ScoringForce[] = [];
  const consumed = new Set<number>();
  const clusterGroups = new Map<string, ScoringForce[]>();

  for (let i = 0; i < forces.length; i++) {
    const f = forces[i];
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

  for (let i = 0; i < forces.length; i++) {
    if (consumed.has(i)) continue;
    const f = forces[i];
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
        text.includes("fiscal");
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

function effectiveIntent(intent: number, constraint: number, structural: number): number {
  return clamp(intent * ((100 - constraint) / 100) * ((100 - structural) / 100));
}

function viabilityScore(
  eff: number,
  timing: number,
  structural: number,
  constraint: number
): number {
  return clamp(eff + timing - Math.max(structural, constraint));
}

function equilibrium(structural: number, constraint: number): CanonicalEquilibrium {
  const sum = structural + constraint;
  if (sum >= 160) return "STABLE";
  if (sum >= 120) return "MIXED";
  return "UNSTABLE";
}

function trajectory(viability: number): CanonicalTrajectory {
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
  structural: number,
  blocker: string
): ViabilityStateLabel {
  const b = blocker.toUpperCase();
  if (b.includes("STRUCTURAL LOCK") && structural >= 80 && viability <= 20) {
    return "NON-VIABLE (STRUCTURALLY LOCKED)";
  }
  if (viability > 70) return "HIGHLY VIABLE";
  if (viability > 50) return "CONDITIONALLY VIABLE";
  if (viability > 20) return "DEFERRED VIABILITY";
  if (b.includes("STRUCTURAL LOCK")) return "NON-VIABLE (STRUCTURALLY LOCKED)";
  return "DEFERRED VIABILITY";
}

function formatFormula(f: {
  intent_strength: number;
  constraint_pressure: number;
  structural_lock_in: number;
  timing_factor: number;
  effective_intent: number;
  viability_score: number;
  equilibrium_state: CanonicalEquilibrium;
  trajectory_type: CanonicalTrajectory;
}): string {
  return [
    `Effective Intent = ${f.intent_strength} × (100−${f.constraint_pressure})/100 × (100−${f.structural_lock_in})/100 = ${f.effective_intent}`,
    `Viability = clamp(${f.effective_intent} + ${f.timing_factor} − max(${f.structural_lock_in}, ${f.constraint_pressure}), 0, 100) = ${f.viability_score}`,
    `Equilibrium: ${f.structural_lock_in}+${f.constraint_pressure}=${f.structural_lock_in + f.constraint_pressure} → ${f.equilibrium_state}. Trajectory: ${f.trajectory_type}.`,
  ].join(" | ");
}

function snapshot(
  intent: number,
  constraint: number,
  structural: number,
  timing: number
): CycleSnapshot {
  const eff = effectiveIntent(intent, constraint, structural);
  const via = viabilityScore(eff, timing, structural, constraint);
  return {
    constraint_pressure: constraint,
    effective_intent: eff,
    structural_lock_in: structural,
    timing_accessibility: timing,
    viability_score: via,
    equilibrium_state: equilibrium(structural, constraint),
  };
}

/**
 * Layer 1 + Layer 2 — ONLY place where math is permitted.
 */
export function deriveCanonicalState(
  rawForces: ScoringForce[],
  blockerClassification = "MIXED"
): { causal: CausalState; frozen: FrozenDerivation } {
  const forces = mergeForces(rawForces);
  const causal: CausalState = { forces, blocker_classification: blockerClassification };

  const intent_strength = maxWeight(forces, "Intent");
  const constraint_pressure = maxWeight(forces, "Constraint");
  const structural_lock_in = maxWeight(forces, "Structural");
  const timing_factor = inferTimingFactor(forces);

  const effective_intent = effectiveIntent(
    intent_strength,
    constraint_pressure,
    structural_lock_in
  );
  const viability_score = viabilityScore(
    effective_intent,
    timing_factor,
    structural_lock_in,
    constraint_pressure
  );
  const equilibrium_state = equilibrium(structural_lock_in, constraint_pressure);
  const trajectory_type = trajectory(viability_score);
  const viability_state = viabilityLabel(
    viability_score,
    structural_lock_in,
    blockerClassification
  );
  const buyer_intent_level = buyerIntentLevel(effective_intent);
  const decision_freedom = decisionFreedom(constraint_pressure);

  const c1 = snapshot(
    intent_strength,
    clamp(constraint_pressure * 0.75),
    clamp(structural_lock_in * 0.9),
    timing_factor
  );
  const c2 = snapshot(
    intent_strength,
    clamp((constraint_pressure + c1.constraint_pressure) / 2),
    structural_lock_in,
    timing_factor
  );
  const c3: CycleSnapshot = {
    constraint_pressure,
    effective_intent,
    structural_lock_in,
    timing_accessibility: timing_factor,
    viability_score,
    equilibrium_state,
  };

  const frozenBase = {
    intent_strength,
    constraint_pressure,
    structural_lock_in,
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

/** Layer 3 consistency gate — throws if any section disagrees with frozen state */
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

// Legacy exports for tests
export const computeCanonicalScores = (
  forces: ScoringForce[],
  blocker = "MIXED"
) => deriveCanonicalState(forces, blocker).frozen;

export const formatCanonicalDerivation = (f: FrozenDerivation) => f.derivation_formula;

export const buildResolutionCycles = (f: FrozenDerivation) => f.resolution_cycles;
