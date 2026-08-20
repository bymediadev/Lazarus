import { generateGeminiText, type ModelTier } from "./modelForPlan.js";

export type LiveObjectionStatus = "open" | "answered" | "dismissed";

export interface LiveObjectionScanRequest {
  full_transcript: string;
  existing_objections?: { id: string; text: string; status: LiveObjectionStatus }[];
  modelTier?: ModelTier;
}

export interface LiveObjectionScanResponse {
  new_objections: { text: string; speaker?: string; evidence?: string }[];
  resolved_ids: string[];
}

function parseJsonBlock(raw: string): LiveObjectionScanResponse {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1].trim() : trimmed;
  const parsed = JSON.parse(jsonText) as LiveObjectionScanResponse;
  return {
    new_objections: Array.isArray(parsed.new_objections) ? parsed.new_objections : [],
    resolved_ids: Array.isArray(parsed.resolved_ids) ? parsed.resolved_ids : [],
  };
}

export async function scanLiveObjections(
  body: LiveObjectionScanRequest
): Promise<LiveObjectionScanResponse> {
  const transcript = body.full_transcript.trim();
  if (transcript.length < 40) {
    return { new_objections: [], resolved_ids: [] };
  }

  const existing = body.existing_objections ?? [];
  const openList = existing
    .filter((o) => o.status === "open")
    .map((o) => `- [${o.id}] ${o.text}`)
    .join("\n");

  const prompt = `You are a live B2B sales call objection tracker. Read the transcript and:
1. List NEW buyer objections or blockers not already tracked (budget, timing, legal, competitor, authority, technical).
2. List IDs of EXISTING open objections that appear RESOLVED or explicitly answered in the latest dialogue.

Return ONLY valid JSON:
{
  "new_objections": [{ "text": "short objection label", "speaker": "name or Buyer", "evidence": "verbatim quote under 20 words" }],
  "resolved_ids": ["id1"]
}

Rules:
- Only objections grounded in the transcript. No invented quotes.
- Do not duplicate objections already listed below.
- resolved_ids only when the transcript shows the concern was addressed or withdrawn.

EXISTING OPEN OBJECTIONS:
${openList || "(none)"}

TRANSCRIPT:
${transcript.slice(-12000)}`;

  const text = await generateGeminiText(prompt, body.modelTier ?? "free");
  return parseJsonBlock(text);
}
