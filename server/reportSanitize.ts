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
