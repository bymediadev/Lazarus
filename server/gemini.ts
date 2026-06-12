import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import {
  auditTranscriptGrounding,
  buildGroundingRetryMessage,
  buildTranscriptConstraints,
  evidenceMatchesTranscript,
  filterInventedForces,
  scrubInventedSummary,
  type GroundingAudit,
  type StakeholderSignal,
} from "./grounding.js";
import {
  assertFrozenConsistency,
  buildDependencyGraph,
  dedupeCouplings,
  deriveCanonicalState,
  deriveProprietaryIndices,
  type CanonicalEquilibrium,
  type CanonicalTrajectory,
  type ProprietaryIndices,
  type ScoringForce,
} from "./scoring.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
export type ForceRole = "parent" | "child" | "derivative" | "independent";
export type ViabilityStateLabel =
  | "HIGHLY VIABLE"
  | "CONDITIONALLY VIABLE"
  | "DEFERRED VIABILITY"
  | "NON-VIABLE (STRUCTURALLY LOCKED)";
export type TrajectoryType = CanonicalTrajectory;
export type EquilibriumState = CanonicalEquilibrium;

export interface DealClassification {
  status: EnterpriseDealStatus;
  confidence_level: number;
}

export interface CausalForce {
  factor: string;
  type: CausalForceType;
  weight: number;
  role: ForceRole;
  derived_from: string[];
  evidence: string;
}

export interface ForceCoupling {
  source: string;
  target: string;
  mechanism: string;
}

export interface ForceInteractionMap {
  amplifies: ForceCoupling[];
  suppresses: ForceCoupling[];
  dependent_forces: { force: string; depends_on: string; relationship: string }[];
  derivative_forces: { force: string; derived_from: string[]; derivation_logic: string }[];
}

export interface ForceDependencyGraph {
  parent_forces: { force: string; generates: string[] }[];
  child_forces: { force: string; derived_from: string }[];
  feedback_loops: { loop: string; forces: string[]; effect: string }[];
  cycle_evolution: string[];
}

export interface ForceInitialization {
  summary: string;
  blocker_classification: string;
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
  convergence_status: string;
  total_cycles: number;
  cycles: ResolutionCycle[];
  convergence_summary: string;
}

export interface EquilibriumAnalysis {
  state: EquilibriumState;
  derived_from_cycles: boolean;
  net_force_balance: string;
  dominating_forces: string[];
  equilibrium_breaker: string;
  explanation: string;
}

export interface ViabilityModel {
  state: ViabilityStateLabel;
  viability_score: number;
  equilibrium_derivation: string;
  derivation_components: {
    intent_strength: number;
    constraint_pressure: number;
    structural_lock_in_impact: number;
    timing_accessibility: number;
  };
}

export interface DealTrajectory {
  trajectory_type: TrajectoryType;
  derivation: string;
  net_force_direction: string;
  driving_interactions: string[];
}

export interface BuyerState {
  intent_strength: number;
  constraint_pressure: number;
  effective_intent: number;
  decision_freedom: string;
  evidence: string[];
}

export interface ReactivationTrigger {
  trigger_event: string;
  probability: number;
  equilibrium_shift: string;
  forces_modified: string[];
  timeframe: string;
}

export interface PipelineEntryValidity {
  classification: string;
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
  blocker_classification: string;
  structural_constraint_type: string;
  deal_state: string;
  viability_score: string;
  trajectory_type: string;
  equilibrium_state: string;
  convergence_status: string;
  buyer_intent_strength: string;
  effective_intent: string;
  constraint_pressure: string;
  reactivation_probability: string;
  recommended_next_action: string;
  deal_risk_index?: string;
  risk_tier?: string;
}

export interface EnterpriseAnalysis {
  deal_classification: DealClassification;
  client_name: string;
  executive_summary: string;
  stakeholders: StakeholderSignal[];
  proprietary_indices?: ProprietaryIndices;
  force_initialization: ForceInitialization;
  causal_forces: CausalForce[];
  resolution_cycles: ResolutionCycles;
  force_interaction_map: ForceInteractionMap;
  force_dependency_graph: ForceDependencyGraph;
  equilibrium_analysis: EquilibriumAnalysis;
  viability_state: ViabilityModel;
  deal_trajectory: DealTrajectory;
  buyer_state: BuyerState;
  reactivation_modeling: ReactivationTrigger[];
  pipeline_entry_validity: PipelineEntryValidity;
  rescue_triage_plan: RescueTriagePlan;
  crm_intelligence: CrmIntelligence;
}

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

const VALID_STATUSES: EnterpriseDealStatus[] = [
  "ACTIVE",
  "STALLED — RECOVERABLE",
  "STALLED — UNCERTAIN",
  "STALLED — HIGH RISK",
  "CLOSED LOST — RECOVERABLE",
  "CLOSED LOST — UNLIKELY",
  "CLOSED WON",
];

function loadSystemPrompt(): string {
  return readFileSync(join(__dirname, "../prompts/final_prompt_v2.txt"), "utf-8");
}

function modelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const chain = preferred ? [preferred, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  return [...new Set(chain)];
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.includes("404") || msg.includes("503");
}

function quotaErrorMessage(lastError: unknown): string {
  const base =
    "Gemini quota exceeded. Wait a few minutes or set GEMINI_MODEL=gemini-2.5-flash in .env.";
  if (lastError instanceof Error && lastError.message) {
    return `${base}\n\nLast error: ${lastError.message.split("\n")[0]}`;
  }
  return base;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function clampScore(n: unknown, fallback = 50): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function normalizeEnterpriseStatus(value: unknown): EnterpriseDealStatus {
  const s = String(value ?? "").toUpperCase().trim();
  for (const valid of VALID_STATUSES) {
    if (s === valid.toUpperCase()) return valid;
  }
  if (s.includes("CLOSED WON") || s.includes("SUCCESS")) return "CLOSED WON";
  if (s.includes("UNCERTAIN") || s.includes("HIGH RISK")) return "STALLED — UNCERTAIN";
  if (s.includes("CLOSED LOST") && s.includes("UNLIKELY")) return "CLOSED LOST — UNLIKELY";
  if (s.includes("CLOSED LOST")) return "CLOSED LOST — RECOVERABLE";
  if (s.includes("ACTIVE")) return "ACTIVE";
  if (s.includes("STALLED")) return "STALLED — RECOVERABLE";
  return "STALLED — RECOVERABLE";
}

function trajectoryDirection(t: CanonicalTrajectory): string {
  if (t === "VALIDATED / VELOCITY" || t === "ACTIVE") return "positive";
  if (t === "DEFERRED (recoverable)") return "neutral";
  return "negative";
}

/** Layer 3 — project frozen derivation read-only; no math here */
function applyCanonicalScoring(result: EnterpriseAnalysis, transcript = ""): EnterpriseAnalysis {
  const rawForces: ScoringForce[] = result.causal_forces.map((f) => ({
    factor: f.factor,
    type: f.type,
    weight: f.weight,
    role: f.role,
    derived_from: f.derived_from,
    evidence: f.evidence,
  }));

  const { causal, frozen } = deriveCanonicalState(
    rawForces,
    result.force_initialization.blocker_classification
  );

  const dominant = causal.forces
    .filter((f) => f.type === "Structural" || f.type === "Constraint")
    .sort((a, b) => b.weight - a.weight)[0];

  const finalCycle = frozen.resolution_cycles.cycles[frozen.resolution_cycles.cycles.length - 1];
  const proprietary_indices = deriveProprietaryIndices(frozen, result.stakeholders, transcript);

  const projected: EnterpriseAnalysis = {
    ...result,
    causal_forces: causal.forces.map((f) => ({
      factor: f.factor,
      type: f.type as CausalForceType,
      weight: f.weight,
      role: (f.role ?? "independent") as ForceRole,
      derived_from: f.derived_from ?? [],
      evidence: f.evidence,
    })),
    resolution_cycles: frozen.resolution_cycles,
    force_interaction_map: {
      amplifies: dedupeCouplings(result.force_interaction_map.amplifies),
      suppresses: dedupeCouplings(result.force_interaction_map.suppresses),
      dependent_forces: [],
      derivative_forces: [],
    },
    force_dependency_graph: {
      ...buildDependencyGraph(causal.forces),
      cycle_evolution: [
        `Frozen viability: ${frozen.viability_score}`,
      ],
    },
    equilibrium_analysis: {
      state: frozen.equilibrium_state,
      derived_from_cycles: true,
      net_force_balance: `${frozen.structural_lock_in}+${frozen.constraint_pressure}=${frozen.structural_lock_in + frozen.constraint_pressure} → ${frozen.equilibrium_state}`,
      dominating_forces: dominant ? [dominant.factor] : result.equilibrium_analysis.dominating_forces,
      equilibrium_breaker: result.equilibrium_analysis.equilibrium_breaker,
      explanation: frozen.derivation_formula,
    },
    viability_state: {
      state: frozen.viability_state,
      viability_score: frozen.viability_score,
      equilibrium_derivation: frozen.derivation_formula,
      derivation_components: {
        intent_strength: frozen.intent_strength,
        constraint_pressure: frozen.constraint_pressure,
        structural_lock_in_impact: frozen.structural_lock_in,
        timing_accessibility: frozen.timing_factor,
        enabler_strength: frozen.enabler_strength,
      },
    },
    deal_trajectory: {
      trajectory_type: frozen.trajectory_type,
      derivation: frozen.derivation_formula,
      net_force_direction: trajectoryDirection(frozen.trajectory_type),
      driving_interactions: [],
    },
    buyer_state: {
      intent_strength: frozen.intent_strength,
      constraint_pressure: frozen.constraint_pressure,
      effective_intent: frozen.effective_intent,
      decision_freedom: frozen.decision_freedom,
      evidence: [
        `Intent ${frozen.intent_strength} | Effective ${frozen.effective_intent} | ${frozen.buyer_intent_level}`,
        `Constraint ${frozen.constraint_pressure} | Freedom ${frozen.decision_freedom}`,
      ],
    },
    reactivation_modeling: result.reactivation_modeling.slice(0, 3),
    crm_intelligence: {
      ...result.crm_intelligence,
      dominant_equilibrium_force:
        result.crm_intelligence.dominant_equilibrium_force || dominant?.factor || "",
      blocker_classification: causal.blocker_classification,
      deal_state: frozen.viability_state,
      viability_score: String(frozen.viability_score),
      trajectory_type: frozen.trajectory_type,
      equilibrium_state: frozen.equilibrium_state,
      convergence_status: frozen.resolution_cycles.convergence_status,
      buyer_intent_strength: String(frozen.intent_strength),
      effective_intent: String(frozen.effective_intent),
      constraint_pressure: String(frozen.constraint_pressure),
      deal_risk_index: String(proprietary_indices.deal_risk_index),
      risk_tier: proprietary_indices.risk_tier,
    },
    proprietary_indices,
  };

  assertFrozenConsistency({
    frozen,
    viability_score: projected.viability_state.viability_score,
    effective_intent: projected.buyer_state.effective_intent,
    equilibrium_state: projected.equilibrium_analysis.state,
    trajectory_type: projected.deal_trajectory.trajectory_type,
    constraint_pressure: projected.buyer_state.constraint_pressure,
    intent_strength: projected.buyer_state.intent_strength,
    crm_viability: projected.crm_intelligence.viability_score,
    crm_effective: projected.crm_intelligence.effective_intent,
    crm_equilibrium: projected.crm_intelligence.equilibrium_state,
    crm_trajectory: projected.crm_intelligence.trajectory_type,
    cycle_final_viability: finalCycle.state_snapshot.viability_score,
    cycle_final_effective: finalCycle.state_snapshot.effective_intent,
    cycle_final_equilibrium: finalCycle.state_snapshot.equilibrium_state,
  });

  return projected;
}

function normalizeForceType(value: unknown): CausalForceType {
  const s = String(value ?? "").trim();
  const types: CausalForceType[] = [
    "Intent",
    "Enabler",
    "Constraint",
    "Structural",
    "Timing",
    "Behavioral",
  ];
  for (const valid of types) {
    if (s.toLowerCase() === valid.toLowerCase()) return valid;
  }
  if (s.toLowerCase().includes("enabler") || s.toLowerCase().includes("enable")) return "Enabler";
  if (s.toLowerCase().includes("intent")) return "Intent";
  if (s.toLowerCase().includes("behavioral")) return "Behavioral";
  if (s.toLowerCase().includes("structural")) return "Structural";
  if (s.toLowerCase().includes("timing")) return "Timing";
  return "Constraint";
}

function normalizeForceRole(value: unknown): ForceRole {
  const s = String(value ?? "").toLowerCase().trim();
  if (s === "parent" || s === "child" || s === "derivative" || s === "independent") return s;
  return "independent";
}

function normalizeCouplings(value: unknown): ForceCoupling[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const c = item as Record<string, unknown>;
    return {
      source: String(c.source ?? ""),
      target: String(c.target ?? ""),
      mechanism: String(c.mechanism ?? ""),
    };
  });
}

function formatDiagnosis(result: EnterpriseAnalysis): string {
  return result.viability_state.equilibrium_derivation;
}

// Strip LLM-assigned scores before derivation — Layer 1 inputs only
function stripLlmScores(raw: Record<string, unknown>): Record<string, unknown> {
  const copy = { ...raw };
  delete copy.viability_state;
  delete copy.deal_trajectory;
  delete copy.buyer_state;
  delete copy.resolution_cycles;
  return copy;
}

function normalizeForceInitialization(
  raw: Record<string, unknown>,
  executiveSummary: string
): ForceInitialization {
  const initRaw = raw.force_initialization as Record<string, unknown> | undefined;
  const crmRaw = raw.crm_intelligence as Record<string, unknown> | undefined;
  return {
    summary: String(initRaw?.summary ?? executiveSummary).trim(),
    blocker_classification: String(
      initRaw?.blocker_classification ?? crmRaw?.blocker_classification ?? "MIXED"
    ),
    classification_rationale: String(initRaw?.classification_rationale ?? ""),
  };
}

function flattenPlan(plan?: Partial<RescueTriagePlan>): string[] {
  const imm = asStringArray(plan?.immediate_0_30_days);
  const near = asStringArray(plan?.near_term_30_90_days);
  const long = asStringArray(plan?.long_term_90_plus_days);
  return [
    ...imm.map((a) => `[0-30d] ${a}`),
    ...near.map((a) => `[30-90d] ${a}`),
    ...long.map((a) => `[90d+] ${a}`),
  ];
}

function normalizePersonaType(s: Record<string, unknown>): string {
  const raw = String(s.persona_type ?? s.stance ?? "Unknown").trim();
  const lower = raw.toLowerCase();
  if (lower.includes("champion") || lower.includes("aligned")) return "Aligned Champion";
  if (lower.includes("absent") || lower.includes("no_show") || lower.includes("no-show")) {
    return "Absent Decision Maker";
  }
  if (lower.includes("detractor") || lower.includes("blocker") || lower.includes("skeptic")) {
    return "Hidden Detractor";
  }
  if (lower === "neutral") return "Neutral";
  return raw || "Unknown";
}

function normalizeStakeholders(raw: Record<string, unknown>): StakeholderSignal[] {
  if (!Array.isArray(raw.stakeholders)) return [];
  return raw.stakeholders
    .map((item) => {
      const s = item as Record<string, unknown>;
      const persona_type = normalizePersonaType(s);
      return {
        name: String(s.name ?? "").trim(),
        role: String(s.role ?? "").trim(),
        stance: persona_type,
        authority_level: String(s.authority_level ?? "unknown").trim(),
        persona_type,
        evidence: String(s.evidence ?? "").trim(),
      };
    })
    .filter((s) => s.name.length > 0);
}

function normalizeCausalForces(raw: Record<string, unknown>): CausalForce[] {
  if (Array.isArray(raw.causal_forces) && raw.causal_forces.length > 0) {
    return raw.causal_forces.map((item) => {
      const f = item as Record<string, unknown>;
      return {
        factor: String(f.factor ?? ""),
        type: normalizeForceType(f.type),
        weight: clampScore(f.weight, 50),
        role: normalizeForceRole(f.role),
        derived_from: asStringArray(f.derived_from),
        evidence: String(f.evidence ?? ""),
      };
    });
  }
  return [];
}

function normalizeInteractionMap(raw: Record<string, unknown>): ForceInteractionMap {
  const mapRaw = raw.force_interaction_map as Record<string, unknown> | undefined;
  const causeRaw = raw.weighted_cause_structure as Record<string, unknown> | undefined;
  const fallbackInteraction = String(causeRaw?.force_interaction ?? "");

  return {
    amplifies: normalizeCouplings(mapRaw?.amplifies),
    suppresses: normalizeCouplings(mapRaw?.suppresses),
    dependent_forces: Array.isArray(mapRaw?.dependent_forces)
      ? (mapRaw!.dependent_forces as Record<string, unknown>[]).map((d) => ({
          force: String(d.force ?? ""),
          depends_on: String(d.depends_on ?? ""),
          relationship: String(d.relationship ?? ""),
        }))
      : [],
    derivative_forces: Array.isArray(mapRaw?.derivative_forces)
      ? (mapRaw!.derivative_forces as Record<string, unknown>[]).map((d) => ({
          force: String(d.force ?? ""),
          derived_from: asStringArray(d.derived_from),
          derivation_logic: String(d.derivation_logic ?? fallbackInteraction),
        }))
      : fallbackInteraction
        ? [{ force: "System interaction", derived_from: [], derivation_logic: fallbackInteraction }]
        : [],
  };
}

function normalizeDependencyGraph(raw: Record<string, unknown>): ForceDependencyGraph {
  const graphRaw = raw.force_dependency_graph as Record<string, unknown> | undefined;
  return {
    parent_forces: Array.isArray(graphRaw?.parent_forces)
      ? (graphRaw!.parent_forces as Record<string, unknown>[]).map((p) => ({
          force: String(p.force ?? ""),
          generates: asStringArray(p.generates),
        }))
      : [],
    child_forces: Array.isArray(graphRaw?.child_forces)
      ? (graphRaw!.child_forces as Record<string, unknown>[]).map((c) => ({
          force: String(c.force ?? ""),
          derived_from: String(c.derived_from ?? ""),
        }))
      : [],
    feedback_loops: Array.isArray(graphRaw?.feedback_loops)
      ? (graphRaw!.feedback_loops as Record<string, unknown>[]).map((l) => ({
          loop: String(l.loop ?? ""),
          forces: asStringArray(l.forces),
          effect: String(l.effect ?? ""),
        }))
      : [],
    cycle_evolution: asStringArray(graphRaw?.cycle_evolution),
  };
}

function normalizeOutput(raw: Record<string, unknown>): EnterpriseAnalysis {
  raw = stripLlmScores(raw);
  const classificationRaw = raw.deal_classification as Record<string, unknown> | undefined;
  const eqRaw = raw.equilibrium_analysis as Record<string, unknown> | undefined;
  const causeRaw = raw.weighted_cause_structure as Record<string, unknown> | undefined;
  const qualRaw = raw.pipeline_entry_validity as Record<string, unknown> | undefined;
  const qualLegacy = raw.qualification_failure_analysis as Record<string, unknown> | undefined;
  const rescueRaw = raw.rescue_triage_plan as Record<string, unknown> | undefined;
  const crmRaw = raw.crm_intelligence as Record<string, unknown> | undefined;

  const deal_classification: DealClassification = {
    status: normalizeEnterpriseStatus(
      classificationRaw?.status ?? raw.deal_status ?? "STALLED — RECOVERABLE"
    ),
    confidence_level: clampScore(
      classificationRaw?.confidence_level ?? raw.confidence_score,
      70
    ),
  };

  const executive_summary = String(
    raw.executive_summary ?? raw.headline ?? raw.stall_cause ?? ""
  ).trim();

  const equilibrium_analysis: EquilibriumAnalysis = {
    state: "UNSTABLE",
    derived_from_cycles: false,
    net_force_balance: "",
    dominating_forces: asStringArray(eqRaw?.dominating_forces ?? []),
    equilibrium_breaker: String(eqRaw?.equilibrium_breaker ?? ""),
    explanation: "",
  };

  const reactivation_modeling: ReactivationTrigger[] = Array.isArray(raw.reactivation_modeling)
    ? raw.reactivation_modeling.map((item) => {
        const t = item as Record<string, unknown>;
        const probRaw = t.probability;
        const probability =
          typeof probRaw === "string" && /^(low|medium|high)$/i.test(probRaw)
            ? probRaw.toLowerCase() === "high"
              ? 75
              : probRaw.toLowerCase() === "low"
                ? 25
                : 50
            : clampScore(probRaw, 50);
        return {
          trigger_event: String(t.trigger_event ?? ""),
          probability,
          equilibrium_shift: String(
            t.equilibrium_shift ?? t.viability_impact ?? ""
          ),
          forces_modified: asStringArray(t.forces_modified),
          timeframe: String(t.timeframe ?? ""),
        };
      })
    : [];

  const rescue_triage_plan: RescueTriagePlan = {
    immediate_0_30_days: asStringArray(rescueRaw?.immediate_0_30_days),
    near_term_30_90_days: asStringArray(rescueRaw?.near_term_30_90_days),
    long_term_90_plus_days: asStringArray(rescueRaw?.long_term_90_plus_days),
  };

  if (flattenPlan(rescue_triage_plan).length === 0 && asStringArray(raw.action_plan).length > 0) {
    rescue_triage_plan.immediate_0_30_days = asStringArray(raw.action_plan);
  }

  const causal_forces = normalizeCausalForces(raw);
  const stakeholders = normalizeStakeholders(raw);

  const result: EnterpriseAnalysis = {
    deal_classification,
    client_name: String(raw.client_name ?? "Unknown Deal"),
    executive_summary,
    stakeholders,
    force_initialization: normalizeForceInitialization(raw, executive_summary),
    causal_forces,
    resolution_cycles: {
      convergence_status: "converged",
      total_cycles: 0,
      cycles: [],
      convergence_summary: "",
    },
    force_interaction_map: normalizeInteractionMap(raw),
    force_dependency_graph: normalizeDependencyGraph(raw),
    equilibrium_analysis,
    viability_state: {
      state: "DEFERRED VIABILITY",
      viability_score: 0,
      equilibrium_derivation: "",
      derivation_components: {
        intent_strength: 0,
        constraint_pressure: 0,
        structural_lock_in_impact: 0,
        timing_accessibility: 0,
      },
    },
    deal_trajectory: {
      trajectory_type: "DEFERRED (recoverable)",
      derivation: "",
      net_force_direction: "neutral",
      driving_interactions: [],
    },
    buyer_state: {
      intent_strength: 0,
      constraint_pressure: 0,
      effective_intent: 0,
      decision_freedom: "partial",
      evidence: [],
    },
    reactivation_modeling,
    pipeline_entry_validity: {
      classification: String(
        qualRaw?.classification ??
          (qualLegacy?.should_have_been_nurture?.toString().startsWith("Yes")
            ? "SHOULD HAVE BEEN DEFERRED"
            : "CORRECTLY QUALIFIED")
      ),
      system_basis: String(qualRaw?.system_basis ?? ""),
      signals_missed: asStringArray(
        qualRaw?.signals_missed ?? qualLegacy?.should_have_discovered ?? raw.qualification_gaps
      ),
      stage_should_have_changed: String(qualRaw?.stage_should_have_changed ?? ""),
      optimal_decision: String(
        qualRaw?.optimal_decision ?? qualLegacy?.should_have_disqualified_earlier ?? ""
      ),
    },
    rescue_triage_plan,
    crm_intelligence: {
      dominant_equilibrium_force: String(
        crmRaw?.dominant_equilibrium_force ??
          crmRaw?.primary_force ??
          crmRaw?.primary_cause_type ??
          equilibrium_analysis.dominating_forces[0] ??
          ""
      ),
      blocker_classification: String(
        crmRaw?.blocker_classification ??
          (raw.force_initialization as Record<string, unknown> | undefined)?.blocker_classification ??
          "MIXED"
      ),
      structural_constraint_type: String(
        crmRaw?.structural_constraint_type ?? crmRaw?.structural_cause_type ?? ""
      ),
      deal_state: "",
      viability_score: "0",
      trajectory_type: "DEFERRED (recoverable)",
      equilibrium_state: "UNSTABLE",
      convergence_status: "converged",
      buyer_intent_strength: "0",
      effective_intent: "0",
      constraint_pressure: "0",
      reactivation_probability: String(crmRaw?.reactivation_probability ?? ""),
      recommended_next_action: String(
        crmRaw?.recommended_next_action ?? crmRaw?.next_best_action ?? ""
      ),
    },
  };

  if (!result.executive_summary || causal_forces.length === 0) {
    throw new Error("Gemini returned an invalid analysis structure.");
  }

  return applyCanonicalScoring(result);
}

export type AnalysisResponse = EnterpriseAnalysis & {
  deal_status: EnterpriseDealStatus;
  confidence_score: number;
  recoverability_score: number;
  headline: string;
  diagnosis: string;
  action_plan: string[];
  stall_cause: string;
  why_it_stalled: string;
  restart_plan: string[];
  grounding_audit?: GroundingAudit;
};

function toApiResponse(result: EnterpriseAnalysis): AnalysisResponse {
  const action_plan = flattenPlan(result.rescue_triage_plan);
  const diagnosis = formatDiagnosis(result);
  return {
    ...result,
    deal_status: result.deal_classification.status,
    confidence_score: result.deal_classification.confidence_level,
    recoverability_score: result.viability_state.viability_score,
    headline: result.executive_summary,
    diagnosis,
    action_plan,
    stall_cause: result.executive_summary,
    why_it_stalled: diagnosis,
    restart_plan: action_plan,
  };
}

function buildExtractionMessage(transcript: string, dealValue: number): string {
  return `${buildTranscriptConstraints(transcript, dealValue)}

Build the People Map (every persona + persona_type) and causal forces with verbatim evidence.
Structural parent forces must quote the buyer/prospect — not the rep's pitch.
Do NOT output viability_state, buyer_state, deal_trajectory, or resolution_cycles — server computes scores.
Merge duplicate root causes. Max 6 forces, max 3 triggers.

TRANSCRIPT:
${transcript}`;
}

async function generateWithModel(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string
): Promise<EnterpriseAnalysis> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0,
    },
  });

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: userMessage },
  ]);

  const text = result.response.text();
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return normalizeOutput(parsed);
}

async function extractWithModels(
  apiKey: string,
  systemPrompt: string,
  userMessage: string
): Promise<EnterpriseAnalysis> {
  const candidates = modelCandidates();
  let lastError: unknown;

  for (const modelName of candidates) {
    try {
      console.log(`Gemini: trying ${modelName}`);
      return await generateWithModel(apiKey, modelName, systemPrompt, userMessage);
    } catch (err) {
      lastError = err;
      if (isRetryableGeminiError(err)) {
        console.warn(`Gemini: ${modelName} unavailable, trying next model`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(quotaErrorMessage(lastError));
}

function applyGroundingFilter(
  analysis: EnterpriseAnalysis,
  transcript: string
): EnterpriseAnalysis {
  const extraOutput = [
    analysis.executive_summary,
    analysis.force_initialization.summary,
    analysis.force_initialization.classification_rationale,
  ].join(" ");

  const groundedForces = filterInventedForces(
    analysis.causal_forces,
    transcript,
    extraOutput
  );
  const groundedStakeholders = analysis.stakeholders.filter((s) =>
    evidenceMatchesTranscript(s.evidence, transcript)
  );

  if (groundedForces.length === 0) {
    throw new Error(
      "No causal forces could be grounded in the transcript. Check that the transcript contains dialogue, not just notes."
    );
  }

  return applyCanonicalScoring({
    ...analysis,
    executive_summary: scrubInventedSummary(analysis.executive_summary, transcript),
    force_initialization: {
      ...analysis.force_initialization,
      summary: scrubInventedSummary(analysis.force_initialization.summary, transcript),
      classification_rationale: scrubInventedSummary(
        analysis.force_initialization.classification_rationale,
        transcript
      ),
    },
    causal_forces: groundedForces,
    stakeholders: groundedStakeholders,
  }, transcript);
}

export async function analyzeTranscript(
  transcript: string,
  dealValue: number
): Promise<AnalysisResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }

  const systemPrompt = loadSystemPrompt();
  let userMessage = buildExtractionMessage(transcript, dealValue);

  let analysis = await extractWithModels(apiKey, systemPrompt, userMessage);
  let audit = auditTranscriptGrounding({
    transcript,
    dealValue,
    causal_forces: analysis.causal_forces,
    executive_summary: analysis.executive_summary,
    force_initialization: analysis.force_initialization,
    stakeholders: analysis.stakeholders,
  });

  if (!audit.pass) {
    console.warn("Grounding audit failed — retrying with correction prompt", audit);
    userMessage = buildGroundingRetryMessage(transcript, dealValue, audit);
    analysis = await extractWithModels(apiKey, systemPrompt, userMessage);
    audit = auditTranscriptGrounding({
      transcript,
      dealValue,
      causal_forces: analysis.causal_forces,
      executive_summary: analysis.executive_summary,
      force_initialization: analysis.force_initialization,
      stakeholders: analysis.stakeholders,
    });
  }

  if (!audit.pass) {
    console.warn("Grounding still failed after retry — filtering invented content", audit);
    analysis = applyGroundingFilter(analysis, transcript);
    audit.warnings.push("Invented or ungrounded content was removed — scores derived from transcript-only forces.");
  } else {
    analysis = applyGroundingFilter(analysis, transcript);
  }

  return {
    ...toApiResponse(analysis),
    grounding_audit: audit,
  };
}

export function formatRootCause(result: EnterpriseAnalysis): string {
  return formatDiagnosis(result);
}
