import { GroundingAudit, HistoricalCrmContextEntry, LiveTranscriptTurn, PostMortemResult, TranscriptSources } from "../types";

/** Empty = same-origin / Vite proxy to localhost:3001. Set to Railway URL for remote API. */
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

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

export interface PostMortemPayload {
  file?: File | null;
  transcript?: string;
  emailThread?: string;
  dealValue: string;
  fieldCapture?: boolean;
  accountId?: string;
  salesCycleDays?: number;
  historicalCrmContext?: HistoricalCrmContextEntry[];
  liveTranscriptPayload?: LiveTranscriptTurn[];
  liveSessionObjections?: { text: string; status: string; source: string }[];
}

export async function runPostMortem(payload: PostMortemPayload): Promise<PostMortemResponse> {
  const formData = new FormData();

  if (payload.file) {
    formData.append("recording", payload.file);
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
    body: formData,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("application/json")
    ? ((await res.json()) as PostMortemResponse & { error?: string })
    : null;

  if (!res.ok) {
    throw new Error(data?.error || `Post-mortem failed (${res.status}).`);
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as { ok?: boolean; id?: string; error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Save failed (${res.status})`);
  }
  return data;
}
