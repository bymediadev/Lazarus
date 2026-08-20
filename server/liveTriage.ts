import { classifySalesRelevance } from "./relevanceGate.js";
import { generateGeminiText, type ModelTier } from "./modelForPlan.js";

export type LiveTriageTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";
export type LiveTriageMomentum = "improving" | "stalling" | "slipping" | "unclear";

export interface LiveTriageRequest {
  full_transcript: string;
  platform?: string;
  deal_value?: number;
  open_objections?: string[];
  modelTier?: ModelTier;
}

export interface LiveTriageResult {
  risk_tier: LiveTriageTier;
  momentum: LiveTriageMomentum;
  headline: string;
  top_blockers: string[];
  next_moves: string[];
  confidence: "low" | "medium" | "high";
  updated_at: string;
}

function parseJsonBlock(raw: string): Omit<LiveTriageResult, "updated_at"> {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1].trim() : trimmed;
  const parsed = JSON.parse(jsonText) as Record<string, unknown>;

  const tierRaw = String(parsed.risk_tier ?? "MODERATE").toUpperCase();
  const risk_tier = (["LOW", "MODERATE", "HIGH", "CRITICAL"].includes(tierRaw)
    ? tierRaw
    : "MODERATE") as LiveTriageTier;

  const momentumRaw = String(parsed.momentum ?? "unclear").toLowerCase();
  const momentum = (
    ["improving", "stalling", "slipping", "unclear"].includes(momentumRaw)
      ? momentumRaw
      : "unclear"
  ) as LiveTriageMomentum;

  const confidenceRaw = String(parsed.confidence ?? "low").toLowerCase();
  const confidence = (
    ["low", "medium", "high"].includes(confidenceRaw) ? confidenceRaw : "low"
  ) as LiveTriageResult["confidence"];

  return {
    risk_tier,
    momentum,
    headline: String(parsed.headline ?? "Listening for deal risk signals…").trim(),
    top_blockers: Array.isArray(parsed.top_blockers)
      ? parsed.top_blockers.map(String).filter(Boolean).slice(0, 4)
      : [],
    next_moves: Array.isArray(parsed.next_moves)
      ? parsed.next_moves.map(String).filter(Boolean).slice(0, 3)
      : [],
    confidence,
  };
}

/** Light mid-call triage — not a full DRI autopsy. Grounded in rolling transcript only. */
export async function runLiveTriage(body: LiveTriageRequest): Promise<LiveTriageResult> {
  const transcript = body.full_transcript.trim();
  if (transcript.length < 60) {
    return {
      risk_tier: "MODERATE",
      momentum: "unclear",
      headline: "Need more dialogue before live triage can score the deal.",
      top_blockers: [],
      next_moves: ["Keep the live session running — speak or paste buyer lines as they land."],
      confidence: "low",
      updated_at: new Date().toISOString(),
    };
  }

  const relevance = await classifySalesRelevance(transcript);
  if (relevance.label === "not_sales") {
    return {
      risk_tier: "LOW",
      momentum: "unclear",
      headline: `Can't use this for deal triage — ${relevance.reason}`,
      top_blockers: ["Live dialogue does not look like a sales or deal conversation."],
      next_moves: [
        "Switch to the buyer call, or paste sales dialogue / a deal email into the evidence package.",
      ],
      confidence: relevance.confidence,
      updated_at: new Date().toISOString(),
    };
  }

  const objections = (body.open_objections ?? []).filter(Boolean).slice(0, 8);
  const platform = body.platform ?? "live";
  const dealValue =
    typeof body.deal_value === "number" && Number.isFinite(body.deal_value)
      ? body.deal_value
      : undefined;

  const prompt = `You are Lazarus Deal Recovery live deal triage during a B2B sales call (${platform}).
Return ONLY valid JSON — a lightweight mid-call snapshot, NOT a full autopsy:

{
  "risk_tier": "LOW" | "MODERATE" | "HIGH" | "CRITICAL",
  "momentum": "improving" | "stalling" | "slipping" | "unclear",
  "headline": "one sentence on deal health right now",
  "top_blockers": ["up to 4 short blockers grounded in dialogue"],
  "next_moves": ["up to 3 coaching moves the rep can try in this call"],
  "confidence": "low" | "medium" | "high"
}

Rules:
- Ground every blocker in the transcript. No invented buyers, dollar amounts, or tools.
- Prefer restraint: if evidence is thin, use MODERATE / unclear / low confidence.
- next_moves must be actionable in the next 5 minutes of the call.
${dealValue != null ? `- Deal value context: $${dealValue}` : ""}
${objections.length ? `- Already tracked open objections:\n${objections.map((o) => `  - ${o}`).join("\n")}` : ""}

TRANSCRIPT (rolling):
${transcript.slice(-14000)}`;

  const raw = await generateGeminiText(prompt, body.modelTier ?? "free");
  const parsed = parseJsonBlock(raw);
  return { ...parsed, updated_at: new Date().toISOString() };
}
