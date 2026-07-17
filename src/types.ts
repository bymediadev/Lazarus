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
  | "Enabler"
  | "Constraint"
  | "Structural"
  | "Timing"
  | "Behavioral";

export interface TranscriptSources {
  audio: boolean;
  manual: boolean;
  email: boolean;
  field: boolean;
}

export interface LiveDealTriage {
  root_issue: string;
  core_blocker: string;
  department_friction_index: number;
}

export type HistoricalConflictType = "confirms" | "contradicts" | "resurfaces" | "new";

export interface HistoricalContextMatch {
  reference_date: string;
  live_dialogue_evidence: string;
  historical_event: string;
  conflict_type: HistoricalConflictType;
}

export interface FrictionDeltaSignal {
  detected: boolean;
  evidence: string;
}

export interface StakeholderDispersionDelta extends FrictionDeltaSignal {
  unmapped_names: string[];
}

export interface FrictionDeltas {
  administrative_gatekeeping: FrictionDeltaSignal;
  stakeholder_dispersion: StakeholderDispersionDelta;
  budget_scoping_gap: FrictionDeltaSignal;
}

export type { VetoHolderRef, HistoricalCrmContextEntry } from "../shared/deepContextTypes";

export interface LiveTranscriptTurn {
  speaker: string;
  timestamp: string;
  dialogue: string;
}

export type ForceRole = "parent" | "child" | "derivative" | "independent";

export type BlockerClassification =
  | "TEMPORARY BLOCKERS"
  | "STRUCTURAL LOCK-INS"
  | "MIXED";

export type ConvergenceStatus = "converged" | "locked" | "oscillating";

export type ViabilityStateLabel =
  | "VALIDATED / CLOSED"
  | "HIGHLY VIABLE"
  | "CONDITIONALLY VIABLE"
  | "DEFERRED VIABILITY"
  | "NON-VIABLE (STRUCTURALLY LOCKED)";

export type TrajectoryType =
  | "VALIDATED / VELOCITY"
  | "DEFERRED (locked)"
  | "DEFERRED (recoverable)"
  | "ACTIVE"
  | "NON-VIABLE / DEAD";

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
  enabler_strength?: number;
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
  deal_risk_index?: string;
  risk_tier?: string;
}

export interface DialogueStallSignals {
  score: number;
  deferral_phrase_count: number;
  handoff_mention_count: number;
  rep_monologue_ratio: number | null;
  avg_turn_gap_seconds: number | null;
  flagged_patterns: string[];
}

export interface StakeholderDispersionDetail {
  index: number;
  authority_gap: boolean;
  multi_department_friction: number;
  persona_breakdown: Record<string, number>;
  flags: string[];
}

export interface ProprietaryIndices {
  deal_risk_index: number;
  stakeholder_dispersion_index: number;
  dialogue_stall_score: number;
  authority_gap_flag: boolean;
  multi_department_friction: number;
  risk_tier: "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
  formula: string;
  dialogue_stall: DialogueStallSignals;
  stakeholder_dispersion: StakeholderDispersionDetail;
}

export type BuyingGroupRole =
  | "champion"
  | "economic_buyer"
  | "technical_veto"
  | "procurement";

export type BuyingGroupStatus = "ALIGNED" | "PARTIAL" | "MISSING";

export interface BuyingGroupRolePresence {
  role: BuyingGroupRole;
  label: string;
  present: boolean;
  quiet: boolean;
  holder: string | null;
  evidence: string | null;
  inferred: boolean;
}

export interface BuyingGroupAlignment {
  status: BuyingGroupStatus;
  summary: string;
  expected_roles: BuyingGroupRole[];
  present_roles: BuyingGroupRole[];
  missing_roles: BuyingGroupRole[];
  quiet_stakeholders: string[];
  roles: BuyingGroupRolePresence[];
  confidence: number;
  evidence: string[];
}

export interface ActionContact {
  name: string;
  role_label: string;
  why: string;
}

export interface StageAction {
  title: string;
  owner: "AE" | "Manager" | "SE" | "CS";
  contact: ActionContact | null;
  objective: string;
  completion_signal: string;
  stage_reason: string;
}

export interface LowFrictionBrief {
  what_happened: string;
  what_next: string;
  who_to_contact: ActionContact | null;
  crm_stage: string;
  stage_bucket: string;
  primary: StageAction;
  supporting: StageAction[];
  noise_cap_note: string;
}

export type ConcernStatus = "OPEN" | "ADDRESSED" | "BLOCKING";
export type ContractGateStatus =
  | "TRACKING"
  | "GATED"
  | "READY"
  | "INSUFFICIENT_HISTORY";

export interface PathwayMeeting {
  date: string;
  stage: string;
  label: string;
  objection_count: number;
  veto_holders: string[];
}

export interface CycleConcern {
  id: string;
  text: string;
  status: ConcernStatus;
  source_meeting: string;
  source_stage: string;
  source_date: string;
  owner_hint: string | null;
  resolution_note: string | null;
  inferred: boolean;
}

export interface ContractReadinessPathway {
  gate_status: ContractGateStatus;
  headline: string;
  why_it_matters: string;
  crm_stage: string;
  stage_bucket: string;
  meetings: PathwayMeeting[];
  concerns: CycleConcern[];
  open_count: number;
  addressed_count: number;
  blocking_count: number;
  block_contract_send: boolean;
  checklist: string[];
  next_unified_step: string;
}

export interface StakeholderSignal {
  name: string;
  role: string;
  /** Mirrors persona_type for display */
  stance: string;
  authority_level?: string;
  persona_type?: string;
  evidence: string;
}

export interface GroundingAudit {
  pass: boolean;
  grounded_force_count: number;
  ungrounded_forces: { factor: string; evidence: string; reason: string }[];
  invented_terms: string[];
  invented_amounts?: string[];
  missing_critical_stakeholders?: string[];
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
  proprietary_indices?: ProprietaryIndices;
  live_deal_triage?: LiveDealTriage;
  historical_context_match?: HistoricalContextMatch[];
  friction_deltas?: FrictionDeltas;
  immediate_remediation?: string[];
  buying_group_alignment?: BuyingGroupAlignment;
  action_brief?: LowFrictionBrief;
  contract_readiness?: ContractReadinessPathway;
  sources?: TranscriptSources;
  processed_at?: string;
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
  if (s.includes("VALIDATED") || s.includes("HIGHLY VIABLE") || s.includes("HIGH VIABILITY")) {
    return "status-success";
  }
  if (s.includes("CONDITIONAL")) return "status-stalled";
  if (s.includes("DEFERRED")) return "status-active";
  if (s.includes("NON-VIABLE") || s.includes("LOCKED")) return "status-failed";
  return "status-stalled";
}

export function trajectoryTagClass(trajectory: string): string {
  const t = trajectory.toUpperCase();
  if (t.includes("VALIDATED") || t === "ACTIVE") return "status-success";
  if (t.includes("RECOVERABLE")) return "status-stalled";
  if (t.includes("LOCKED") || t.includes("NON-VIABLE") || t.includes("DEAD")) return "status-failed";
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
  if (t === "intent" || t === "enabler") return "emerald";
  if (t === "constraint" || t === "behavioral") return "amber";
  if (t === "structural" || t === "timing") return "red";
  return "neutral";
}

export function driTagClass(tier?: string): string {
  switch (tier?.toUpperCase()) {
    case "CRITICAL":
      return "dri-critical";
    case "HIGH":
      return "dri-high";
    case "MODERATE":
      return "dri-moderate";
    default:
      return "dri-low";
  }
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

