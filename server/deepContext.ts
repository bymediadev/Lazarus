import {
  type HistoricalCrmContextEntry,
  type VetoHolderRef,
  normalizeVetoHolders,
} from "../shared/deepContextTypes.js";
import type { WhiteWhaleAccountIntel } from "../shared/whitewhaleTypes.js";

export type { VetoHolderRef, HistoricalCrmContextEntry };

export interface LiveTranscriptTurn {
  speaker: string;
  timestamp: string;
  dialogue: string;
}

export interface LiveSessionObjection {
  text: string;
  status: string;
  source: string;
}

export interface DeepContextInput {
  accountId?: string;
  salesCycleDays?: number;
  historicalCrmContext?: HistoricalCrmContextEntry[];
  liveTranscriptPayload?: LiveTranscriptTurn[];
  liveSessionObjections?: LiveSessionObjection[];
  /** Account buying signals / Why Now (from WhiteWhale). */
  whitewhaleContext?: WhiteWhaleAccountIntel | null;
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

export interface DeepContextOutput {
  live_deal_triage?: LiveDealTriage;
  historical_context_match?: HistoricalContextMatch[];
  friction_deltas?: FrictionDeltas;
  immediate_remediation?: string[];
}

export interface IngestMetadata {
  account_id?: string;
  sales_cycle_days?: number;
  historical_crm_context?: HistoricalCrmContextEntry[];
  whitewhale_domain?: string;
  whitewhale_scaled_score?: number | null;
  live_session_objections?: {
    count: number;
    open_count: number;
    items: Array<{ text: string; status: string; source: string }>;
  };
}

export interface DealMemorySummary {
  deal_risk_index?: number;
  risk_tier?: string;
  viability_score?: number;
  viability_state?: string;
  trajectory_type?: string;
  deal_status?: string;
  live_deal_triage?: LiveDealTriage;
  friction_deltas?: {
    administrative_gatekeeping: { detected: boolean };
    stakeholder_dispersion: { detected: boolean; unmapped_names: string[] };
    budget_scoping_gap: { detected: boolean };
  };
  historical_context_match?: Array<{
    reference_date: string;
    conflict_type: HistoricalConflictType;
    historical_event: string;
  }>;
  stakeholders?: Array<{ name: string; role: string; stance?: string }>;
  objection_tags?: string[];
  recurring_veto_holders?: string[];
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function clampScore(n: unknown, fallback = 0): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(100, Math.max(0, Math.round(v)));
}

function normalizeConflictType(value: unknown): HistoricalConflictType {
  const s = String(value ?? "").toLowerCase().trim();
  if (s === "confirms" || s === "contradicts" || s === "resurfaces" || s === "new") return s;
  return "new";
}

function normalizeFrictionSignal(raw: unknown): FrictionDeltaSignal {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    detected: Boolean(o.detected),
    evidence: String(o.evidence ?? "").trim(),
  };
}

function normalizeStakeholderDispersion(raw: unknown): StakeholderDispersionDelta {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    detected: Boolean(o.detected),
    evidence: String(o.evidence ?? "").trim(),
    unmapped_names: asStringArray(o.unmapped_names),
  };
}

export function parseJsonField<T>(value: unknown): T | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
  if (typeof value === "object") return value as T;
  return undefined;
}

export function detectRecurringVetoHolders(
  entries: HistoricalCrmContextEntry[]
): string[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const vh of entry.past_identified_veto_holders) {
      counts.set(vh.veto_holder_id, (counts.get(vh.veto_holder_id) ?? 0) + 1);
    }
  }
  const recurring = [...counts.entries()]
    .filter(([, n]) => n > 1)
    .map(([id]) => id);
  if (recurring.length) {
    console.info("[deepContext] Recurring veto_holder_id across timeline:", recurring);
  }
  return recurring;
}

function filterHistoricalBySalesCycle(
  entries: HistoricalCrmContextEntry[],
  salesCycleDays?: number
): HistoricalCrmContextEntry[] {
  if (!salesCycleDays || !entries.length) return entries;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - salesCycleDays);
  const cutoffMs = cutoff.getTime();

  return entries.filter((entry) => {
    if (!entry.date) return true;
    const parsed = Date.parse(entry.date);
    if (!Number.isFinite(parsed)) return true;
    if (parsed >= cutoffMs) return true;
    console.warn(
      `[deepContext] Stripped historical entry outside ${salesCycleDays}-day window: ${entry.date}`
    );
    return false;
  });
}

export function parseHistoricalCrmContext(value: unknown): HistoricalCrmContextEntry[] {
  const parsed = parseJsonField<unknown>(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((entry) => {
      const o = entry as Record<string, unknown>;
      return {
        date: String(o.date ?? "").trim(),
        stage: String(o.stage ?? "").trim(),
        past_identified_veto_holders: normalizeVetoHolders(o.past_identified_veto_holders),
        past_logged_objections: asStringArray(o.past_logged_objections),
      };
    })
    .filter(
      (e) =>
        e.date ||
        e.stage ||
        e.past_identified_veto_holders.length ||
        e.past_logged_objections.length
    );
}

export function parseLiveTranscriptPayload(value: unknown): LiveTranscriptTurn[] {
  const parsed = parseJsonField<unknown>(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((turn) => {
      const o = turn as Record<string, unknown>;
      return {
        speaker: String(o.speaker ?? "Unknown").trim(),
        timestamp: String(o.timestamp ?? "").trim(),
        dialogue: String(o.dialogue ?? "").trim(),
      };
    })
    .filter((t) => t.dialogue);
}

export function formatLiveTranscriptPayload(turns: LiveTranscriptTurn[]): string {
  return turns
    .map((t) => {
      const ts = t.timestamp ? `[${t.timestamp}] ` : "";
      return `${ts}${t.speaker}: ${t.dialogue}`;
    })
    .join("\n");
}

export function parseLiveSessionObjections(value: unknown): LiveSessionObjection[] {
  const parsed = parseJsonField<unknown>(value);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .map((item) => {
      const o = item as Record<string, unknown>;
      const text = String(o.text ?? "").trim();
      if (!text) return null;
      return {
        text,
        status: String(o.status ?? "open").trim(),
        source: String(o.source ?? "manual").trim(),
      };
    })
    .filter((o): o is LiveSessionObjection => o !== null);
}

export const MAX_SALES_CYCLE_DAYS = 180;

export function parseDeepContextFromBody(body: Record<string, unknown>): DeepContextInput {
  const accountId = String(body.account_id ?? "").trim() || undefined;
  const salesCycleDaysRaw = parseInt(String(body.sales_cycle_days ?? ""), 10);

  if (Number.isFinite(salesCycleDaysRaw) && salesCycleDaysRaw < 1) {
    console.warn("[deepContext] sales_cycle_days must be >= 1, ignoring value:", salesCycleDaysRaw);
  }
  if (Number.isFinite(salesCycleDaysRaw) && salesCycleDaysRaw > MAX_SALES_CYCLE_DAYS) {
    console.warn(
      `[deepContext] sales_cycle_days capped at ${MAX_SALES_CYCLE_DAYS}, was:`,
      salesCycleDaysRaw
    );
  }

  const salesCycleDays =
    Number.isFinite(salesCycleDaysRaw) && salesCycleDaysRaw >= 1
      ? Math.min(salesCycleDaysRaw, MAX_SALES_CYCLE_DAYS)
      : undefined;

  let historicalCrmContext = parseHistoricalCrmContext(body.historical_crm_context);
  if (historicalCrmContext.length && salesCycleDays) {
    historicalCrmContext = filterHistoricalBySalesCycle(historicalCrmContext, salesCycleDays);
  }

  return {
    accountId,
    salesCycleDays,
    historicalCrmContext,
    liveTranscriptPayload: parseLiveTranscriptPayload(body.live_transcript_payload),
    liveSessionObjections: parseLiveSessionObjections(body.live_session_objections),
  };
}

export function buildIngestMetadata(ctx: DeepContextInput): IngestMetadata | undefined {
  const hasHistory = (ctx.historicalCrmContext?.length ?? 0) > 0;
  const hasObjections = (ctx.liveSessionObjections?.length ?? 0) > 0;
  const hasWw = !!ctx.whitewhaleContext?.domain;

  if (!ctx.accountId && !ctx.salesCycleDays && !hasHistory && !hasObjections && !hasWw) {
    return undefined;
  }

  const metadata: IngestMetadata = {};
  if (ctx.accountId) metadata.account_id = ctx.accountId;
  if (ctx.salesCycleDays) metadata.sales_cycle_days = ctx.salesCycleDays;
  if (hasHistory) metadata.historical_crm_context = ctx.historicalCrmContext;
  if (ctx.whitewhaleContext?.domain) {
    metadata.whitewhale_domain = ctx.whitewhaleContext.domain;
    metadata.whitewhale_scaled_score = ctx.whitewhaleContext.scaled_score ?? null;
  }

  if (hasObjections && ctx.liveSessionObjections) {
    const open_count = ctx.liveSessionObjections.filter(
      (o) => o.status.toLowerCase() !== "resolved"
    ).length;
    metadata.live_session_objections = {
      count: ctx.liveSessionObjections.length,
      open_count,
      items: ctx.liveSessionObjections.map(({ text, status, source }) => ({
        text,
        status,
        source,
      })),
    };
  }

  return metadata;
}

/** Build redacted deal memory from analysis — no raw transcript quotes. */
export function buildDealMemorySummary(
  analysis: Record<string, unknown>,
  recurringVetoHolders?: string[]
): DealMemorySummary {
  const pi = analysis.proprietary_indices as Record<string, unknown> | undefined;
  const viability = analysis.viability_state as Record<string, unknown> | undefined;
  const trajectory = analysis.deal_trajectory as Record<string, unknown> | undefined;
  const classification = analysis.deal_classification as Record<string, unknown> | undefined;
  const frictionRaw = analysis.friction_deltas as Record<string, unknown> | undefined;
  const triageRaw = analysis.live_deal_triage as Record<string, unknown> | undefined;
  const stakeholdersRaw = analysis.stakeholders as unknown[] | undefined;
  const histMatchRaw = analysis.historical_context_match as unknown[] | undefined;

  const summary: DealMemorySummary = {};

  if (pi?.deal_risk_index != null) {
    summary.deal_risk_index = clampScore(pi.deal_risk_index);
  }
  if (typeof pi?.risk_tier === "string") summary.risk_tier = pi.risk_tier;
  if (viability?.viability_score != null) {
    summary.viability_score = clampScore(viability.viability_score);
  }
  if (typeof viability?.state === "string") summary.viability_state = viability.state;
  if (typeof trajectory?.trajectory_type === "string") {
    summary.trajectory_type = trajectory.trajectory_type;
  }
  if (typeof classification?.status === "string") summary.deal_status = classification.status;

  if (triageRaw) {
    summary.live_deal_triage = {
      root_issue: String(triageRaw.root_issue ?? "").trim(),
      core_blocker: String(triageRaw.core_blocker ?? "").trim(),
      department_friction_index: clampScore(triageRaw.department_friction_index, 0),
    };
  }

  if (frictionRaw) {
    const admin = frictionRaw.administrative_gatekeeping as Record<string, unknown> | undefined;
    const dispersion = frictionRaw.stakeholder_dispersion as Record<string, unknown> | undefined;
    const budget = frictionRaw.budget_scoping_gap as Record<string, unknown> | undefined;
    summary.friction_deltas = {
      administrative_gatekeeping: { detected: Boolean(admin?.detected) },
      stakeholder_dispersion: {
        detected: Boolean(dispersion?.detected),
        unmapped_names: asStringArray(dispersion?.unmapped_names),
      },
      budget_scoping_gap: { detected: Boolean(budget?.detected) },
    };
  }

  if (Array.isArray(histMatchRaw) && histMatchRaw.length) {
    summary.historical_context_match = histMatchRaw
      .map((item) => {
        const o = item as Record<string, unknown>;
        return {
          reference_date: String(o.reference_date ?? "").trim(),
          conflict_type: normalizeConflictType(o.conflict_type),
          historical_event: String(o.historical_event ?? "").trim(),
        };
      })
      .filter((m) => m.reference_date || m.historical_event);

    summary.objection_tags = [
      ...new Set(summary.historical_context_match.map((m) => m.conflict_type)),
    ];
  }

  if (Array.isArray(stakeholdersRaw) && stakeholdersRaw.length) {
    summary.stakeholders = stakeholdersRaw
      .map((s) => {
        const o = s as Record<string, unknown>;
        const name = String(o.name ?? "").trim();
        if (!name) return null;
        return {
          name,
          role: String(o.role ?? "").trim(),
          stance: String(o.stance ?? o.persona_type ?? "").trim() || undefined,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);
  }

  if (recurringVetoHolders?.length) {
    summary.recurring_veto_holders = recurringVetoHolders;
  }

  return summary;
}

export function buildDeepContextMessageBlock(ctx: DeepContextInput): string {
  const parts: string[] = [];

  if (ctx.accountId) parts.push(`Account ID: ${ctx.accountId}`);
  if (ctx.salesCycleDays) parts.push(`Sales cycle length: ${ctx.salesCycleDays} days`);

  if (ctx.historicalCrmContext?.length) {
    parts.push(
      "HISTORICAL CRM CONTEXT (cross-reference live dialogue — do NOT evaluate in isolation):",
      JSON.stringify(ctx.historicalCrmContext, null, 2)
    );
  }

  if (ctx.liveTranscriptPayload?.length) {
    parts.push(
      "STRUCTURED LIVE TRANSCRIPT PAYLOAD:",
      JSON.stringify(ctx.liveTranscriptPayload, null, 2)
    );
  }

  if (ctx.liveSessionObjections?.length) {
    parts.push(
      "LIVE SESSION OBJECTIONS (from meeting companion — cross-reference with dialogue):",
      JSON.stringify(ctx.liveSessionObjections, null, 2)
    );
  }

  if (ctx.whitewhaleContext?.domain) {
    const ww = ctx.whitewhaleContext;
    const signalLines = (ww.signals ?? [])
      .slice(0, 8)
      .map((s) => {
        const src =
          s.sources?.[0]?.headline ||
          s.sources?.[0]?.one_sentence_summary ||
          s.sources?.[0]?.source ||
          "";
        return `- ${s.name}: ${s.answer}${src ? ` (source: ${src})` : ""}`;
      })
      .join("\n");
    parts.push(
      [
        "WHITEWHALE ACCOUNT BUYING SIGNALS (market timing / Why Now — NOT CRM notes; use for forecastability and recoverable-vs-flat-no judgment only):",
        `Domain: ${ww.domain}`,
        ww.name ? `Account name: ${ww.name}` : "",
        ww.scaled_score != null ? `WhiteWhale scaled score: ${ww.scaled_score}` : "",
        ww.summary ? `Why Now narrative: ${ww.summary}` : "",
        signalLines ? `Positive signals:\n${signalLines}` : "No positive signals returned.",
      ]
        .filter(Boolean)
        .join("\n")
    );
  }

  if (!parts.length) return "";

  return `\n\nDEEP CONTEXT INPUT:\n${parts.join("\n\n")}\n`;
}

export function normalizeDeepContextOutput(raw: Record<string, unknown>): DeepContextOutput {
  const triageRaw = raw.live_deal_triage as Record<string, unknown> | undefined;
  const frictionRaw = raw.friction_deltas as Record<string, unknown> | undefined;

  const live_deal_triage: LiveDealTriage | undefined = triageRaw
    ? {
        root_issue: String(triageRaw.root_issue ?? "").trim(),
        core_blocker: String(triageRaw.core_blocker ?? "").trim(),
        department_friction_index: clampScore(triageRaw.department_friction_index, 0),
      }
    : undefined;

  const historical_context_match: HistoricalContextMatch[] = Array.isArray(raw.historical_context_match)
    ? raw.historical_context_match
        .map((item) => {
          const o = item as Record<string, unknown>;
          return {
            reference_date: String(o.reference_date ?? "").trim(),
            live_dialogue_evidence: String(o.live_dialogue_evidence ?? "").trim(),
            historical_event: String(o.historical_event ?? "").trim(),
            conflict_type: normalizeConflictType(o.conflict_type),
          };
        })
        .filter((m) => m.reference_date || m.live_dialogue_evidence || m.historical_event)
    : [];

  const friction_deltas: FrictionDeltas | undefined = frictionRaw
    ? {
        administrative_gatekeeping: normalizeFrictionSignal(frictionRaw.administrative_gatekeeping),
        stakeholder_dispersion: normalizeStakeholderDispersion(frictionRaw.stakeholder_dispersion),
        budget_scoping_gap: normalizeFrictionSignal(frictionRaw.budget_scoping_gap),
      }
    : undefined;

  const immediate_remediation = asStringArray(raw.immediate_remediation);

  const output: DeepContextOutput = {};
  if (
    live_deal_triage?.root_issue ||
    live_deal_triage?.core_blocker ||
    (live_deal_triage?.department_friction_index ?? 0) > 0
  ) {
    output.live_deal_triage = live_deal_triage;
  }
  if (historical_context_match.length) output.historical_context_match = historical_context_match;
  if (friction_deltas) output.friction_deltas = friction_deltas;
  if (immediate_remediation.length) output.immediate_remediation = immediate_remediation;

  return output;
}

export function mergeImmediateRemediation(
  rescuePlan: { immediate_0_30_days: string[] },
  immediateRemediation?: string[]
): void {
  if (!immediateRemediation?.length) return;
  const existing = new Set(rescuePlan.immediate_0_30_days);
  for (const item of immediateRemediation) {
    if (!existing.has(item)) {
      rescuePlan.immediate_0_30_days.unshift(item);
      existing.add(item);
    }
  }
}
