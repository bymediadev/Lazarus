/**
 * What the portal is allowed to keep. The HTTP response still carries the full brief.
 * Evidence quotes, transcripts, and CRM blocks are removed before a row is written.
 */

const DROPPED_KEYS = new Set([
  "evidence",
  "transcript",
  "transcript_text",
  "historical_context_match",
  "historical_crm_context",
  "grounding_audit",
  "quotes",
  "quote",
]);

export function stripStoredAnalysis(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => stripStoredAnalysis(item));
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (DROPPED_KEYS.has(key)) continue;
    out[key] = stripStoredAnalysis(child);
  }
  return out;
}

export function storedAnalysisJson(raw: string | Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (raw == null || raw === "") return null;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const stripped = stripStoredAnalysis(parsed);
  if (!stripped || typeof stripped !== "object" || Array.isArray(stripped)) return null;
  return stripped as Record<string, unknown>;
}

export function containsEvidence(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => containsEvidence(item));
  if (!value || typeof value !== "object") return false;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (DROPPED_KEYS.has(key)) return true;
    if (containsEvidence(child)) return true;
  }
  return false;
}

const FINISHED_AFTER_DAYS = 30;

/** 30 days after won or a flat no. Open and recoverable deals have no purge date. */
export function purgeAfterForStatus(status: string, now = new Date()): string | null {
  const normalized = status.toUpperCase().replace(/[—–-]/g, " ");
  const won = normalized.includes("CLOSED WON");
  const flatNo = normalized.includes("CLOSED LOST") && normalized.includes("UNLIKELY");
  if (!won && !flatNo) return null;
  const purge = new Date(now.getTime());
  purge.setDate(purge.getDate() + FINISHED_AFTER_DAYS);
  return purge.toISOString();
}

/**
 * Rescue feedback moves the same clock.
 * Won or a recorded loss starts 30 days. Still stalled or unknown clears it.
 */
export function purgeAfterForRescueOutcome(outcome: string, now = new Date()): string | null {
  const normalized = outcome.trim().toLowerCase();
  if (normalized === "closed_won") return purgeAfterForStatus("CLOSED WON", now);
  if (normalized === "lost") return purgeAfterForStatus("CLOSED LOST — UNLIKELY", now);
  return null;
}

export const NARRATIVE_FIELDS = [
  "transcript_text",
  "why_it_stalled",
  "restart_plan",
  "stall_cause",
  "analysis_json",
  "deal_memory_summary",
] as const;

/**
 * Columns written for a report. Caller-supplied transcript text, purge dates,
 * quotes, and tenant ids are ignored. Status decides the clock.
 */
export function storedReportColumns(input: {
  dealStatus: string;
  analysisJson?: string | Record<string, unknown> | null;
  dealMemorySummary?: Record<string, unknown> | null;
  injected?: unknown;
  now?: Date;
}): {
  transcript_text: null;
  purge_after: string | null;
  analysis_json: Record<string, unknown> | null;
  deal_memory_summary: Record<string, unknown> | null;
} {
  void input.injected;
  const memory = input.dealMemorySummary ? storedAnalysisJson(input.dealMemorySummary) : null;
  return {
    transcript_text: null,
    purge_after: purgeAfterForStatus(input.dealStatus, input.now ?? new Date()),
    analysis_json: storedAnalysisJson(input.analysisJson),
    deal_memory_summary: memory && Object.keys(memory).length > 0 ? memory : null,
  };
}

/** CRM link rows keep the external id. Note text and quotes are not stored. */
export function crmLinkWriteFields(patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (DROPPED_KEYS.has(key)) continue;
    out[key] = value;
  }
  out.historical_crm_context = null;
  return out;
}

export type RetentionReport = {
  id: string;
  purge_after?: string | null;
};

export type RetentionLink = {
  id: string;
  post_mortem_id?: string | null;
};

/** Reports past purge_after, plus CRM links that point at those reports. */
export function retentionPurgePlan<T extends RetentionReport>(
  reports: T[],
  links: RetentionLink[],
  now: Date
): { reportIds: string[]; linkIds: string[]; remaining: T[] } {
  const cutoff = now.getTime();
  const due = reports.filter((row) => {
    if (!row.purge_after) return false;
    const at = Date.parse(row.purge_after);
    return Number.isFinite(at) && at <= cutoff;
  });
  const reportIds = due.map((row) => row.id);
  const dueIds = new Set(reportIds);
  const linkIds = links
    .filter((link) => !!link.post_mortem_id && dueIds.has(link.post_mortem_id))
    .map((link) => link.id);
  return {
    reportIds,
    linkIds,
    remaining: reports.filter((row) => !dueIds.has(row.id)),
  };
}

/** Company from the API key only when nobody is signed in. Body tenant_id is ignored. */
export function tenantForReportWrite(input: {
  userId?: string | null;
  membershipTenantId?: string | null;
  tenantIdFromKey?: string | null;
  body?: unknown;
}): string | null {
  const chosen = input.userId ? input.membershipTenantId : input.tenantIdFromKey;
  const id = typeof chosen === "string" ? chosen.trim() : "";
  return id || null;
}
