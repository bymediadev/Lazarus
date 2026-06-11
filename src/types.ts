export type EnterpriseDealStatus =
  | "ACTIVE"
  | "STALLED — RECOVERABLE"
  | "STALLED — UNCERTAIN"
  | "STALLED — HIGH RISK"
  | "CLOSED LOST — RECOVERABLE"
  | "CLOSED LOST — UNLIKELY"
  | "CLOSED WON";

export type CausalForceType =
  | "Intent"
  | "Constraint"
  | "Structural"
  | "Timing"
  | "Behavioral";

export type ForceRole = "parent" | "child" | "derivative" | "independent";

export type BlockerClassification =
  | "TEMPORARY BLOCKERS"
  | "STRUCTURAL LOCK-INS"
  | "MIXED";

export type ConvergenceStatus = "converged" | "locked" | "oscillating";

export type ViabilityStateLabel =
  | "HIGHLY VIABLE"
  | "CONDITIONALLY VIABLE"
  | "DEFERRED VIABILITY"
  | "NON-VIABLE (STRUCTURALLY LOCKED)";

export type TrajectoryType =
  | "DEFERRED (locked)"
  | "DEFERRED (recoverable)"
  | "ACTIVE";

export type EquilibriumState = "STABLE" | "MIXED" | "UNSTABLE";

export type PipelineEntryClassification =
  | "CORRECTLY QUALIFIED"
  | "CONDITIONAL PIPELINE"
  | "TIME-DEFERRED PIPELINE"
  | "SHOULD HAVE BEEN DEFERRED"
  | "SHOULD HAVE BEEN DISQUALIFIED"
  | "SHOULD HAVE BEEN NURTURE ONLY";

export interface DealClassification {
  status: EnterpriseDealStatus;
  confidence_level: number;
  recoverability_score?: number;
}

export interface CausalForce {
  factor: string;
  type: CausalForceType;
  weight: number;
  role?: ForceRole;
  derived_from?: string[];
  evidence: string;
}

export interface ForceCoupling {
  source: string;
  target: string;
  mechanism: string;
}

export interface ForceDependency {
  force: string;
  depends_on: string;
  relationship: string;
}

export interface DerivativeForce {
  force: string;
  derived_from: string[];
  derivation_logic: string;
}

export interface ForceInteractionMap {
  amplifies: ForceCoupling[];
  suppresses: ForceCoupling[];
  dependent_forces: ForceDependency[];
  derivative_forces: DerivativeForce[];
}

export interface ParentForce {
  force: string;
  generates: string[];
}

export interface ChildForce {
  force: string;
  derived_from: string;
}

export interface FeedbackLoop {
  loop: string;
  forces: string[];
  effect: string;
}

export interface ForceDependencyGraph {
  parent_forces: ParentForce[];
  child_forces: ChildForce[];
  feedback_loops: FeedbackLoop[];
  cycle_evolution?: string[];
}

export interface ForceInitialization {
  summary: string;
  blocker_classification: BlockerClassification | string;
  classification_rationale: string;
}

export interface CycleStateSnapshot {
  constraint_pressure: number;
  effective_intent: number;
  structural_lock_in: number;
  timing_accessibility: number;
  viability_score: number;
  equilibrium_state: string;
}

export interface ResolutionCycle {
  cycle: number;
  phase: string;
  state_snapshot: CycleStateSnapshot;
  state_change: string;
}

export interface ResolutionCycles {
  convergence_status: ConvergenceStatus | string;
  total_cycles: number;
  cycles: ResolutionCycle[];
  convergence_summary: string;
}

export interface EquilibriumAnalysis {
  state: EquilibriumState;
  derived_from_cycles?: boolean;
  net_force_balance?: string;
  dominating_forces: string[];
  equilibrium_breaker: string;
  explanation: string;
}

export interface ViabilityDerivationComponents {
  intent_strength: number;
  constraint_pressure: number;
  structural_lock_in_impact: number;
  timing_accessibility: number;
}

export interface ViabilityModel {
  state: ViabilityStateLabel;
  viability_score: number;
  equilibrium_derivation: string;
  derivation_components: ViabilityDerivationComponents;
  /** @deprecated */
  explanation?: string;
}

export interface DealTrajectory {
  trajectory_type: TrajectoryType;
  derivation: string;
  net_force_direction: string;
  driving_interactions: string[];
  /** @deprecated */
  explanation?: string;
  driving_forces?: string[];
}

/** @deprecated */
export interface WeightedCauseStructure {
  primary_force: string;
  secondary_force: string;
  structural_force: string;
  timing_force: string;
  force_interaction: string;
}

export interface BuyerState {
  intent_strength: number | string;
  constraint_pressure?: number | string;
  effective_intent?: number | string;
  constraint_severity?: string;
  decision_freedom: string;
  evidence: string[];
}

export interface ReactivationTrigger {
  trigger_event: string;
  probability: number | string;
  equilibrium_shift: string;
  forces_modified: string[];
  timeframe: string;
  /** @deprecated */
  viability_impact?: string | number;
  impact_level?: number;
}

export interface PipelineEntryValidity {
  classification: PipelineEntryClassification | string;
  system_basis: string;
  signals_missed: string[];
  stage_should_have_changed: string;
  optimal_decision: string;
}

export interface RescueTriagePlan {
  immediate_0_30_days: string[];
  near_term_30_90_days: string[];
  long_term_90_plus_days: string[];
}

export interface CrmIntelligence {
  dominant_equilibrium_force: string;
  blocker_classification?: string;
  structural_constraint_type: string;
  deal_state: string;
  viability_score: string;
  trajectory_type: string;
  equilibrium_state: string;
  convergence_status?: string;
  buyer_intent_strength: string;
  effective_intent: string;
  constraint_pressure: string;
  reactivation_probability: string;
  recommended_next_action: string;
  /** @deprecated */
  primary_force?: string;
  secondary_force?: string;
  primary_cause_type?: string;
  secondary_cause_type?: string;
  structural_cause_type?: string;
  recoverability_score?: string;
  constraint_severity?: string;
}

export interface StakeholderSignal {
  name: string;
  role: string;
  stance: string;
  evidence: string;
}

export interface GroundingAudit {
  pass: boolean;
  grounded_force_count: number;
  ungrounded_forces: { factor: string; evidence: string; reason: string }[];
  invented_terms: string[];
  stakeholders: StakeholderSignal[];
  ungrounded_stakeholders: { name: string; reason: string }[];
  warnings: string[];
}

export interface PostMortemResult {
  deal_classification?: DealClassification;
  deal_status?: EnterpriseDealStatus | string;
  confidence_score?: number;
  recoverability_score?: number;
  client_name?: string;
  executive_summary?: string;
  stakeholders?: StakeholderSignal[];
  grounding_audit?: GroundingAudit;
  force_initialization?: ForceInitialization;
  causal_forces?: CausalForce[];
  resolution_cycles?: ResolutionCycles;
  force_interaction_map?: ForceInteractionMap;
  force_dependency_graph?: ForceDependencyGraph;
  equilibrium_analysis?: EquilibriumAnalysis;
  viability_state?: ViabilityModel;
  deal_trajectory?: DealTrajectory;
  buyer_state?: BuyerState;
  reactivation_modeling?: ReactivationTrigger[];
  pipeline_entry_validity?: PipelineEntryValidity;
  rescue_triage_plan?: RescueTriagePlan;
  crm_intelligence?: CrmIntelligence;
  sources?: { audio: boolean; manual: boolean };
  id?: string | null;
  warnings?: string[];
  weighted_cause_structure?: WeightedCauseStructure;
  constraint_model?: unknown;
  root_cause_analysis?: unknown;
  saveability_analysis?: unknown;
  qualification_failure_analysis?: unknown;
  headline?: string;
  diagnosis?: string;
  action_plan?: string[];
}

function clampScore(n: unknown, fallback = 50): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, Math.round(v)));
}

export function statusTagClass(status: string): string {
  const s = status.toUpperCase();
  if (s.includes("CLOSED WON")) return "status-success";
  if (s.includes("CLOSED LOST")) return "status-failed";
  if (s.includes("UNCERTAIN") || s.includes("HIGH RISK")) return "status-risk";
  if (s.includes("ACTIVE")) return "status-active";
  return "status-stalled";
}

export function viabilityTagClass(state: string): string {
  const s = state.toUpperCase();
  if (s.includes("HIGHLY VIABLE") || s.includes("HIGH VIABILITY")) return "status-success";
  if (s.includes("CONDITIONAL")) return "status-stalled";
  if (s.includes("DEFERRED")) return "status-active";
  if (s.includes("NON-VIABLE") || s.includes("LOCKED")) return "status-failed";
  return "status-stalled";
}

export function trajectoryTagClass(trajectory: string): string {
  const t = trajectory.toUpperCase();
  if (t === "ACTIVE") return "status-success";
  if (t.includes("RECOVERABLE")) return "status-stalled";
  if (t.includes("LOCKED")) return "status-failed";
  return "status-stalled";
}

export function equilibriumTagClass(state: string): string {
  const s = state.toUpperCase();
  if (s === "STABLE") return "status-success";
  if (s === "MIXED") return "status-stalled";
  return "status-failed";
}

export function blockerTagClass(blocker: string): string {
  const s = blocker.toUpperCase();
  if (s.includes("TEMPORARY")) return "status-active";
  if (s.includes("STRUCTURAL LOCK")) return "status-failed";
  return "status-stalled";
}

export function forceTypeClass(type: string): "emerald" | "amber" | "red" | "neutral" {
  const t = type.toLowerCase();
  if (t === "intent") return "emerald";
  if (t === "constraint" || t === "behavioral") return "amber";
  if (t === "structural" || t === "timing") return "red";
  return "neutral";
}

export function flattenRescuePlan(plan?: RescueTriagePlan): string[] {
  if (!plan) return [];
  return [
    ...plan.immediate_0_30_days.map((a) => `[0-30d] ${a}`),
    ...plan.near_term_30_90_days.map((a) => `[30-90d] ${a}`),
    ...plan.long_term_90_plus_days.map((a) => `[90d+] ${a}`),
  ];
}

export function formatSystemDiagnosis(r: PostMortemResult): string {
  return r.viability_state?.equilibrium_derivation ?? "";
}

function normalizeResolutionCycles(raw: PostMortemResult): ResolutionCycles {
  const rc = raw.resolution_cycles;
  if (rc?.cycles?.length) {
    return {
      convergence_status: rc.convergence_status ?? "converged",
      total_cycles: rc.total_cycles ?? rc.cycles.length,
      cycles: rc.cycles.map((c) => ({
        cycle: c.cycle,
        phase: c.phase,
        state_snapshot: {
          constraint_pressure: clampScore(c.state_snapshot?.constraint_pressure),
          effective_intent: clampScore(c.state_snapshot?.effective_intent),
          structural_lock_in: clampScore(c.state_snapshot?.structural_lock_in, 50),
          timing_accessibility: clampScore(c.state_snapshot?.timing_accessibility, 50),
          viability_score: clampScore(c.state_snapshot?.viability_score),
          equilibrium_state: String(c.state_snapshot?.equilibrium_state ?? "UNSTABLE"),
        },
        state_change: c.state_change,
      })),
      convergence_summary: rc.convergence_summary ?? "",
    };
  }
  return {
    convergence_status: "converged",
    total_cycles: 1,
    cycles: [],
    convergence_summary: "Legacy analysis — resolution cycles not simulated.",
  };
}

function emptyInteractionMap(): ForceInteractionMap {
  return { amplifies: [], suppresses: [], dependent_forces: [], derivative_forces: [] };
}

function emptyDependencyGraph(): ForceDependencyGraph {
  return { parent_forces: [], child_forces: [], feedback_loops: [] };
}

/** Layer 3 — pass-through only; no client-side recomputation */
export function normalizeResult(raw: PostMortemResult): PostMortemResult {
  const viability = raw.viability_state ?? {
    state: "DEFERRED VIABILITY" as ViabilityStateLabel,
    viability_score: raw.recoverability_score ?? 0,
    equilibrium_derivation: "",
    derivation_components: {
      intent_strength: 0,
      constraint_pressure: 0,
      structural_lock_in_impact: 0,
      timing_accessibility: 0,
    },
  };

  const deal_trajectory: DealTrajectory = raw.deal_trajectory ?? {
    trajectory_type: "DEFERRED (recoverable)",
    derivation: "",
    net_force_direction: "neutral",
    driving_interactions: [],
  };

  const classification: DealClassification = {
    status:
      (raw.deal_classification?.status as EnterpriseDealStatus) ??
      (raw.deal_status as EnterpriseDealStatus) ??
      "STALLED — RECOVERABLE",
    confidence_level: clampScore(
      raw.deal_classification?.confidence_level ?? raw.confidence_score,
      70
    ),
    recoverability_score: viability.viability_score,
  };

  const executive_summary = raw.executive_summary ?? raw.headline ?? "";
  const action_plan = raw.action_plan?.length ? raw.action_plan : flattenRescuePlan(raw.rescue_triage_plan);

  const pipeline_entry_validity: PipelineEntryValidity = raw.pipeline_entry_validity ?? {
    classification: "CORRECTLY QUALIFIED",
    system_basis: "",
    signals_missed: [],
    stage_should_have_changed: "",
    optimal_decision: "",
  };

  return {
    ...raw,
    deal_classification: classification,
    deal_status: classification.status,
    recoverability_score: viability.viability_score,
    confidence_score: classification.confidence_level,
    executive_summary,
    viability_state: viability,
    deal_trajectory,
    causal_forces: (raw.causal_forces ?? []).map((f) => ({
      ...f,
      derived_from: f.derived_from ?? [],
    })),
    force_initialization: raw.force_initialization ?? {
      summary: raw.executive_summary ?? "",
      blocker_classification: raw.crm_intelligence?.blocker_classification ?? "MIXED",
      classification_rationale: "",
    },
    resolution_cycles: normalizeResolutionCycles(raw),
    force_interaction_map: raw.force_interaction_map ?? emptyInteractionMap(),
    force_dependency_graph: {
      ...(raw.force_dependency_graph ?? emptyDependencyGraph()),
      cycle_evolution: raw.force_dependency_graph?.cycle_evolution ?? [],
    },
    equilibrium_analysis: raw.equilibrium_analysis ?? {
      state: "UNSTABLE",
      dominating_forces: [],
      equilibrium_breaker: "",
      explanation: "",
    },
    headline: executive_summary,
    diagnosis: raw.diagnosis ?? formatSystemDiagnosis({ ...raw, viability_state: viability, deal_trajectory }),
    action_plan,
    rescue_triage_plan: raw.rescue_triage_plan ?? {
      immediate_0_30_days: [],
      near_term_30_90_days: [],
      long_term_90_plus_days: [],
    },
    reactivation_modeling: (raw.reactivation_modeling ?? []).map((t) => ({
      ...t,
      equilibrium_shift: t.equilibrium_shift ?? String(t.viability_impact ?? ""),
      forces_modified: t.forces_modified ?? [],
    })),
    pipeline_entry_validity,
    buyer_state: raw.buyer_state
      ? {
          ...raw.buyer_state,
          effective_intent:
            raw.buyer_state.effective_intent ?? raw.buyer_state.intent_strength,
          constraint_pressure:
            raw.buyer_state.constraint_pressure ?? raw.buyer_state.constraint_severity ?? 50,
        }
      : undefined,
    crm_intelligence: raw.crm_intelligence
      ? {
          ...raw.crm_intelligence,
          dominant_equilibrium_force:
            raw.crm_intelligence.dominant_equilibrium_force ?? raw.crm_intelligence.primary_force ?? "",
          effective_intent:
            raw.crm_intelligence.effective_intent ?? raw.crm_intelligence.buyer_intent_strength ?? "",
          equilibrium_state: raw.crm_intelligence.equilibrium_state ?? "metastable",
        }
      : undefined,
  };
}

export const MOCK_POST_MORTEM: PostMortemResult = normalizeResult({
  deal_classification: { status: "STALLED — RECOVERABLE", confidence_level: 91 },
  stakeholders: [
    {
      name: "Marcus Vance",
      role: "CIO",
      stance: "economic_buyer",
      evidence: "Marcus Vance (MV) – Chief Information Officer, CyberCore Logistics",
    },
  ],
  client_name: "CyberCore Logistics",
  executive_summary:
    "CyberCore discovery call: acquisition bandwidth and board capex create structural lock-in with high constraint pressure. Genuine intent present but suppressed by force interaction. Temporary blockers — defer until equilibrium shifts.",
  force_initialization: {
    summary: "5 forces initialized from discovery call: 2 structural parents, 2 derivatives, 1 intent",
    blocker_classification: "TEMPORARY BLOCKERS",
    classification_rationale:
      "Acquisition bandwidth and fiscal timing are time-bound (Type A). No competitive contract lock or permanent vendor commitment (Type B).",
  },
  resolution_cycles: {
    convergence_status: "converged",
    total_cycles: 3,
    cycles: [
      {
        cycle: 1,
        phase: "structural propagation",
        state_snapshot: {
          constraint_pressure: 60,
          effective_intent: 7,
          structural_lock_in: 77,
          timing_accessibility: 5,
          viability_score: 0,
          equilibrium_state: "MIXED",
        },
        state_change: "Structural propagation (intermediate)",
      },
      {
        cycle: 2,
        phase: "constraint feedback",
        state_snapshot: {
          constraint_pressure: 70,
          effective_intent: 4,
          structural_lock_in: 85,
          timing_accessibility: 5,
          viability_score: 0,
          equilibrium_state: "MIXED",
        },
        state_change: "Constraint feedback (intermediate)",
      },
      {
        cycle: 3,
        phase: "frozen equilibrium",
        state_snapshot: {
          constraint_pressure: 80,
          effective_intent: 2,
          structural_lock_in: 85,
          timing_accessibility: 5,
          viability_score: 0,
          equilibrium_state: "STABLE",
        },
        state_change: "Frozen — final derived state",
      },
    ],
    convergence_summary:
      "Viability 0→0→0. Effective intent 7→4→2. Equilibrium: STABLE.",
  },
  causal_forces: [
    {
      factor: "Technical validation and solution praise",
      type: "Intent",
      weight: 78,
      role: "independent",
      derived_from: [],
      evidence: '"The technology is definitely there. You guys have clearly done this before."',
    },
    {
      factor: "Acquisition integration bandwidth exhaustion",
      type: "Structural",
      weight: 85,
      role: "parent",
      derived_from: [],
      evidence: '"My DBA and InfoSec teams are working 60-hour weeks during the acquisition."',
    },
    {
      factor: "Operational constraint pressure on team availability",
      type: "Constraint",
      weight: 80,
      role: "derivative",
      derived_from: ["Acquisition integration bandwidth exhaustion"],
      evidence: '"I can\'t allocate 5 hours a week, let alone 20."',
    },
    {
      factor: "Board capex freeze policy",
      type: "Structural",
      weight: 82,
      role: "parent",
      derived_from: [],
      evidence: '"The board has frozen any IT spend over $500K without same-fiscal-year ROI."',
    },
    {
      factor: "Fiscal calendar timing lock",
      type: "Timing",
      weight: 70,
      role: "derivative",
      derived_from: ["Board capex freeze policy", "Operational constraint pressure on team availability"],
      evidence: '"9-month deployment pushes us past the fiscal window entirely."',
    },
  ],
  force_interaction_map: {
    amplifies: [
      {
        source: "Acquisition integration bandwidth exhaustion",
        target: "Operational constraint pressure on team availability",
        mechanism: "Structural bandwidth lock directly generates operational constraint — not independent",
      },
      {
        source: "Board capex freeze policy",
        target: "Fiscal calendar timing lock",
        mechanism: "Capex policy makes 9-month deployment structurally impossible within fiscal year",
      },
    ],
    suppresses: [
      {
        source: "Operational constraint pressure on team availability",
        target: "Technical validation and solution praise",
        mechanism: "High constraint pressure reduces effective intent — praise cannot convert to action",
      },
      {
        source: "Board capex freeze policy",
        target: "Technical validation and solution praise",
        mechanism: "Structural lock-in caps effective intent impact regardless of enthusiasm",
      },
    ],
    dependent_forces: [
      {
        force: "Operational constraint pressure on team availability",
        depends_on: "Acquisition integration bandwidth exhaustion",
        relationship: "Constraint is CAUSED by structural acquisition lock — not standalone",
      },
      {
        force: "Fiscal calendar timing lock",
        depends_on: "Board capex freeze policy",
        relationship: "Timing force is derivative of structural fiscal policy",
      },
    ],
    derivative_forces: [
      {
        force: "Fiscal calendar timing lock",
        derived_from: ["Board capex freeze policy", "Operational constraint pressure"],
        derivation_logic: "Timing emerges from intersection of fiscal policy and resource unavailability",
      },
    ],
  },
  force_dependency_graph: {
    parent_forces: [
      { force: "Acquisition integration bandwidth exhaustion", generates: ["Operational constraint pressure on team availability"] },
      { force: "Board capex freeze policy", generates: ["Fiscal calendar timing lock"] },
    ],
    child_forces: [
      { force: "Operational constraint pressure", derived_from: "Acquisition integration bandwidth exhaustion" },
      { force: "Fiscal calendar timing lock", derived_from: "Board capex freeze policy" },
    ],
    feedback_loops: [
      {
        loop: "Constraint-intent suppression cycle",
        forces: ["Operational constraint pressure", "Technical validation and solution praise"],
        effect: "Reinforcing: constraint suppresses intent → reduces resource allocation urgency",
      },
    ],
    cycle_evolution: [
      "Cycle 1: structural→constraint coupling established",
      "Cycle 2: feedback loop strengthened, intent decay accelerated",
      "Cycle 3: graph locked — no new derivatives, equilibrium frozen",
    ],
  },
  equilibrium_analysis: {
    state: "STABLE",
    derived_from_cycles: true,
    net_force_balance: "Structural(85)+Constraint(80)=165 → STABLE",
    dominating_forces: [
      "Acquisition integration bandwidth exhaustion (85)",
      "Board capex freeze policy (82)",
    ],
    equilibrium_breaker: "Acquisition integration completes — releases bandwidth constraint and shifts structural rigidity",
    explanation:
      "Effective Intent = 78 × (100−80)/100 × (100−85)/100 = 2 | Viability = clamp(2 + 5 − max(85, 80), 0, 100) = 0 | Equilibrium: 85+80=165 → STABLE. Trajectory: DEFERRED (locked).",
  },
  viability_state: {
    state: "DEFERRED VIABILITY",
    viability_score: 0,
    equilibrium_derivation:
      "Effective Intent = 78 × (100−80)/100 × (100−85)/100 = 2 | Viability = clamp(2 + 5 − max(85, 80), 0, 100) = 0 | Equilibrium: 85+80=165 → STABLE. Trajectory: DEFERRED (locked).",
    derivation_components: {
      intent_strength: 78,
      constraint_pressure: 80,
      structural_lock_in_impact: 85,
      timing_accessibility: 5,
    },
  },
  deal_trajectory: {
    trajectory_type: "DEFERRED (locked)",
    derivation: "Viability 0 → DEFERRED (locked)",
    net_force_direction: "negative",
    driving_interactions: [],
  },
  buyer_state: {
    intent_strength: 78,
    constraint_pressure: 80,
    effective_intent: 2,
    decision_freedom: "limited",
    evidence: [
      "Intent 78 | Effective 2 | suppressed intent",
      "Constraint 80 | Freedom limited",
    ],
  },
  reactivation_modeling: [
    {
      trigger_event: "Acquisition integration completes",
      probability: 75,
      equilibrium_shift: "Breaks metastable equilibrium — reduces structural parent force, releases derivative constraint",
      forces_modified: ["Acquisition bandwidth 85→40", "Constraint pressure 88→55", "Effective intent rises to ~60"],
      timeframe: "60-90 days",
    },
    {
      trigger_event: "New fiscal year / capex policy reset",
      probability: 55,
      equilibrium_shift: "Shifts structural equilibrium — timing accessibility increases",
      forces_modified: ["Board capex force 82→35", "Timing lock dissolves", "Trajectory shifts FROZEN→DEFERRED"],
      timeframe: "3-6 months",
    },
  ],
  pipeline_entry_validity: {
    classification: "SHOULD HAVE BEEN DEFERRED",
    system_basis:
      "Structural lock-in (acquisition + board policy) was dominant at discovery — force interaction indicates deferral, not active pipeline pursuit",
    signals_missed: ["Pending acquisition", "Board capex policy", "Resource availability"],
    stage_should_have_changed: "First discovery — once structural parents identified, defer not pursue",
    optimal_decision: "Nurture with documentation; re-engage post-equilibrium shift at day 55",
  },
  rescue_triage_plan: {
    immediate_0_30_days: ["Deliver AS/400 docs", "Move to deferred nurture; CRM alert day 55"],
    near_term_30_90_days: ["Build phased sub-$500K ROI model for post-equilibrium re-engagement"],
    long_term_90_plus_days: ["Re-engage when acquisition equilibrium breaks"],
  },
  crm_intelligence: {
    dominant_equilibrium_force: "Acquisition integration bandwidth exhaustion",
    blocker_classification: "TEMPORARY BLOCKERS",
    structural_constraint_type: "Structural→Constraint coupling / fiscal timing",
    deal_state: "DEFERRED VIABILITY",
    viability_score: "0",
    trajectory_type: "DEFERRED (locked)",
    equilibrium_state: "STABLE",
    convergence_status: "converged",
    buyer_intent_strength: "78",
    effective_intent: "2",
    constraint_pressure: "80",
    reactivation_probability: "65",
    recommended_next_action: "Maintain nurture; monitor acquisition close as equilibrium breaker",
  },
});
