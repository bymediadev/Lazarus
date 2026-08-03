import { GroundingAudit, HistoricalCrmContextEntry, LiveTranscriptTurn, PostMortemResult, TranscriptSources } from "../types";

/** Empty = same-origin (production) or Vite proxy to localhost:3001 (local `npm run dev`). */
const viteEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;
export const API_BASE = (viteEnv?.VITE_API_URL ?? "").replace(/\/$/, "");

/** Sent as X-Api-Key when VITE_LAZARUS_API_KEY is set (must match server LAZARUS_API_KEY). */
export function apiAuthHeaders(json = false): Record<string, string> {
  const headers: Record<string, string> = {};
  const key = (viteEnv?.VITE_LAZARUS_API_KEY ?? "").trim();
  if (key) headers["X-Api-Key"] = key;
  if (json) headers["Content-Type"] = "application/json";
  return headers;
}

export function apiTargetLabel(): string {
  if (!API_BASE) return "local API (localhost:3001)";
  try {
    return new URL(API_BASE).host;
  } catch {
    return API_BASE;
  }
}

export interface PostMortemResponse extends PostMortemResult {
  id?: string | null;
  sources?: TranscriptSources;
  warnings?: string[];
  grounding_audit?: GroundingAudit;
  processed_at?: string;
}

export interface RelevanceVerdict {
  label: "sales_deal" | "not_sales";
  reason: string;
  confidence?: "low" | "medium" | "high";
}

export class PostMortemApiError extends Error {
  code?: string;
  relevance?: RelevanceVerdict;

  constructor(message: string, opts?: { code?: string; relevance?: RelevanceVerdict }) {
    super(message);
    this.name = "PostMortemApiError";
    this.code = opts?.code;
    this.relevance = opts?.relevance;
  }
}

export interface PostMortemPayload {
  file?: File | null;
  document?: File | null;
  transcript?: string;
  emailThread?: string;
  dealValue: string;
  fieldCapture?: boolean;
  accountId?: string;
  salesCycleDays?: number;
  historicalCrmContext?: HistoricalCrmContextEntry[];
  liveTranscriptPayload?: LiveTranscriptTurn[];
  liveSessionObjections?: { text: string; status: string; source: string }[];
  /** Bypass sales-relevance gate after an explicit user override. */
  forceAnalysis?: boolean;
}

export async function runPostMortem(payload: PostMortemPayload): Promise<PostMortemResponse> {
  const formData = new FormData();

  if (payload.file) {
    formData.append("recording", payload.file);
  }

  if (payload.document) {
    formData.append("document", payload.document);
  }

  const manual = payload.transcript?.trim();
  if (manual) {
    formData.append("transcript", manual);
  }

  const email = payload.emailThread?.trim();
  if (email) {
    formData.append("email_thread", email);
  }

  formData.append("deal_value", payload.dealValue || "0");

  if (payload.fieldCapture) {
    formData.append("field_capture", "1");
  }

  if (payload.forceAnalysis) {
    formData.append("force_analysis", "1");
  }

  if (payload.accountId) {
    formData.append("account_id", payload.accountId);
  }

  if (payload.salesCycleDays != null && payload.salesCycleDays > 0) {
    formData.append("sales_cycle_days", String(payload.salesCycleDays));
  }

  if (payload.historicalCrmContext?.length) {
    formData.append("historical_crm_context", JSON.stringify(payload.historicalCrmContext));
  }

  if (payload.liveTranscriptPayload?.length) {
    formData.append("live_transcript_payload", JSON.stringify(payload.liveTranscriptPayload));
  }

  if (payload.liveSessionObjections?.length) {
    formData.append("live_session_objections", JSON.stringify(payload.liveSessionObjections));
  }

  const url = `${API_BASE}/api/post-mortem`;
  const res = await fetch(url, {
    method: "POST",
    headers: apiAuthHeaders(),
    body: formData,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await res.json()) as PostMortemResponse & {
        error?: string;
        code?: string;
        relevance?: RelevanceVerdict;
      })
    : null;

  if (!res.ok) {
    throw new PostMortemApiError(data?.error || `Post-mortem failed (${res.status}).`, {
      code: data?.code,
      relevance: data?.relevance,
    });
  }

  if (!data) {
    throw new Error(
      API_BASE
        ? `API at ${API_BASE} returned a non-JSON response.`
        : "API server unavailable. Run npm run dev to start the backend."
    );
  }

  return data;
}

export async function checkHealth(): Promise<{
  status: string;
  gemini: boolean;
  assemblyai: boolean;
  supabase: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

export async function saveRescueOutcome(
  postMortemId: string,
  body: {
    outcome: string;
    rescue_action_taken: string;
    proprietary_indices: PostMortemResult["proprietary_indices"];
    viability_score: number;
    trajectory_type: string;
    constraint_pressure: number;
    stakeholders: PostMortemResult["stakeholders"];
  }
): Promise<{ ok: boolean; id?: string }> {
  const res = await fetch(`${API_BASE}/api/post-mortem/${postMortemId}/rescue-outcome`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  return { ok: data.ok === true, id: data.id };
}
