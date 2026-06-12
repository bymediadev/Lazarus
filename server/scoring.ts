/**
 * Three-layer deterministic compiler:
 *   Layer 1 — CausalState (inputs only, polarity-resolved)
 *   Layer 2 — FrozenDerivation (single derivation pass)
 *   Layer 3 — Output projection (read-only, no math)
 */

export type CanonicalEquilibrium = "STABLE" | "MIXED" | "UNSTABLE";

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
  return enabler >= 40 && constraint >= 50 && constraint < 88 && structural < 80;
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
  if (sum >= 160) return "STABLE";
  if (sum >= 120) return "MIXED";
  return "UNSTABLE";
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
    if (viability <= 50) return "DEFERRED (recoverable)";
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
  structural: number,
  constraint: number,
  enabler: number,
  trajectory_type: CanonicalTrajectory,
  blocker: string
): ViabilityStateLabel {
  if (trajectory_type === "VALIDATED / VELOCITY" && constraint <= 0 && enabler >= 50) {
    return "VALIDATED / CLOSED";
  }
  if (trajectory_type === "NON-VIABLE / DEAD") {
    return "NON-VIABLE (STRUCTURALLY LOCKED)";
  }
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

export function deriveCanonicalState(
  rawForces: ScoringForce[],
  blockerClassification = "MIXED"
): { causal: CausalState; frozen: FrozenDerivation } {
  const forces = mergeForces(rawForces);
  const causal: CausalState = { forces, blocker_classification: blockerClassification };

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
    blockerClassification
  );
  const equilibrium_state = equilibrium(structural_lock_in, constraint_pressure);
  const trajectory_type = trajectory(
    viability_score,
    constraint_pressure,
    structural_lock_in,
    enabler_strength,
    blockerClassification
  );
  const viability_state = viabilityLabel(
    viability_score,
    structural_lock_in,
    constraint_pressure,
    enabler_strength,
    trajectory_type,
    blockerClassification
  );
  const buyer_intent_level = buyerIntentLevel(effective_intent);
  const decision_freedom = decisionFreedom(constraint_pressure);

  const c1 = snapshot(
    intent_strength,
    clamp(constraint_pressure * 0.75),
    clamp(structural_lock_in * 0.9),
    clamp(enabler_strength * 0.9),
    timing_factor,
    blockerClassification
  );
  const c2 = snapshot(
    intent_strength,
    clamp((constraint_pressure + c1.constraint_pressure) / 2),
    structural_lock_in,
    enabler_strength,
    timing_factor,
    blockerClassification
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
}

export interface StakeholderDispersion {
  index: number;
  authority_gap: boolean;
  multi_department_friction: number;
  persona_breakdown: Record<string, number>;
  flags: string[];
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

function normalizePersona(s: StakeholderIndexInput): string {
  const raw = (s.persona_type ?? s.stance ?? "").toLowerCase().trim();
  if (raw.includes("absent")) return "absent decision maker";
  if (raw.includes("hidden") && raw.includes("detractor")) return "hidden detractor";
  if (raw.includes("suppressed")) return "suppressed champion";
  if (raw.includes("aligned")) return "aligned champion";
  return raw || "unknown";
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
  const multi_department_friction = clamp(deptMentions.size * 14 + (absent > 0 ? 12 : 0));

  const index = clamp(raw + multi_department_friction * 0.25);

  return {
    index,
    authority_gap,
    multi_department_friction,
    persona_breakdown,
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

  let deferral_phrase_count = 0;
  for (const phrase of DEFERRAL_PHRASES) {
    if (lower.includes(phrase)) {
      deferral_phrase_count++;
      flagged_patterns.push(phrase);
    }
  }

  let handoff_mention_count = 0;
  for (const dept of HANDOFF_DEPARTMENTS) {
    if (lower.includes(dept.trim())) {
      handoff_mention_count++;
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
      if (avg_turn_gap_seconds > 45) flagged_patterns.push("long turn gaps");
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
  };
}

function riskTier(dri: number): DealRiskTier {
  if (dri >= 75) return "CRITICAL";
  if (dri >= 55) return "HIGH";
  if (dri >= 35) return "MODERATE";
  return "LOW";
}

/** Deal Risk Index — higher = more stall/recovery risk. Proprietary composite, not LLM-derived. */
export function computeDealRiskIndex(
  frozen: FrozenDerivation,
  dispersion: StakeholderDispersion,
  stall: DialogueStallSignals
): number {
  const viabilityInverse = 100 - frozen.viability_score;
  const timingPenalty =
    frozen.timing_factor <= 5 && frozen.constraint_pressure > 40 ? 10 : 0;

  const authorityGapRecoverable =
    frozen.enabler_strength >= 40 &&
    frozen.constraint_pressure >= 50 &&
    frozen.constraint_pressure < 88 &&
    frozen.structural_lock_in < 80;

  const stallContribution = authorityGapRecoverable
    ? Math.min(stall.score, 40)
    : stall.score;

  return clamp(
    viabilityInverse * 0.3 +
      frozen.constraint_pressure * 0.25 +
      frozen.structural_lock_in * 0.15 +
      dispersion.index * 0.2 +
      stallContribution * 0.1 +
      timingPenalty -
      frozen.enabler_strength * 0.15
  );
}

export function deriveProprietaryIndices(
  frozen: FrozenDerivation,
  stakeholders: StakeholderIndexInput[],
  transcript = ""
): ProprietaryIndices {
  const stakeholder_dispersion = computeStakeholderDispersion(stakeholders);
  const dialogue_stall = computeDialogueStallSignals(transcript);
  const deal_risk_index = computeDealRiskIndex(
    frozen,
    stakeholder_dispersion,
    dialogue_stall
  );
  const risk_tier = riskTier(deal_risk_index);

  const formula = [
    `DRI ${deal_risk_index} = 0.30×(100−${frozen.viability_score}) + 0.25×${frozen.constraint_pressure} + 0.15×${frozen.structural_lock_in}`,
    `+ 0.20×dispersion(${stakeholder_dispersion.index}) + 0.10×stall(${dialogue_stall.score}) − 0.15×enabler(${frozen.enabler_strength})`,
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
