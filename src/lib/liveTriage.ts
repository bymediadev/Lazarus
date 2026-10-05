import { API_BASE, apiAuthHeaders } from "./api";
import type { MeetingPlatformId } from "./meetingPlatforms";
import type { LiveObjection } from "./liveObjections";

export type LiveTriageTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type LiveTriageMomentum = "improving" | "stalling" | "slipping" | "unclear";

export interface LiveTriageResult {
  risk_tier: LiveTriageTier;
  momentum: LiveTriageMomentum;
  headline: string;
  top_blockers: string[];
  next_moves: string[];
  confidence: "low" | "medium" | "high";
  updated_at: string;
}

export async function fetchLiveTriage(input: {
  transcript: string;
  platform?: MeetingPlatformId | null;
  dealValue?: string;
  objections?: LiveObjection[];
  captchaToken?: string;
}): Promise<LiveTriageResult> {
  const headers = apiAuthHeaders(true);
  const captcha = input.captchaToken?.trim();
  if (captcha) headers["X-Captcha-Token"] = captcha;
  const res = await fetch(`${API_BASE}/api/live/triage`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      full_transcript: input.transcript,
      platform: input.platform ?? "live",
      deal_value: parseFloat(input.dealValue ?? "") || undefined,
      open_objections: (input.objections ?? [])
        .filter((o) => o.status === "open")
        .map((o) => o.text),
    }),
  });

  const data = (await res.json()) as LiveTriageResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Live triage failed (${res.status})`);
  return data;
}
