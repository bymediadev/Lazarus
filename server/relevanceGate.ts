import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelCandidatesForTier } from "./modelForPlan.js";

export type RelevanceLabel = "sales_deal" | "not_sales";
export type RelevanceConfidence = "low" | "medium" | "high";

export interface RelevanceVerdict {
  label: RelevanceLabel;
  reason: string;
  confidence: RelevanceConfidence;
}

/** Minimum stitched length before we bother classifying (below this we do not reject). */
export const RELEVANCE_MIN_CHARS = 120;

const SAMPLE_CHARS = 12000;

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1].trim() : trimmed;
  return JSON.parse(jsonText) as Record<string, unknown>;
}

/** Pure parse helper for regression tests. */
export function parseRelevanceVerdict(raw: string): RelevanceVerdict {
  const parsed = parseJsonObject(raw);
  const labelRaw = String(parsed.label ?? "").toLowerCase().trim();
  const label: RelevanceLabel = labelRaw === "not_sales" ? "not_sales" : "sales_deal";
  const confidenceRaw = String(parsed.confidence ?? "medium").toLowerCase();
  const confidence = (
    ["low", "medium", "high"].includes(confidenceRaw) ? confidenceRaw : "medium"
  ) as RelevanceConfidence;
  const reason =
    String(parsed.reason ?? "").trim() ||
    (label === "not_sales"
      ? "Content does not look like sales or deal evidence."
      : "Content appears sales or deal related.");
  return { label, reason, confidence };
}

/**
 * Classify whether stitched evidence is usable for deal recovery analysis.
 * Fail-open on API/parse errors (returns sales_deal + low confidence) so a flaky
 * classifier never blocks a real deal run.
 */
export async function classifySalesRelevance(text: string): Promise<RelevanceVerdict> {
  const sample = text.trim();
  if (sample.length < RELEVANCE_MIN_CHARS) {
    return {
      label: "sales_deal",
      reason: "Evidence is too short to reject; proceeding to analysis.",
      confidence: "low",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      label: "sales_deal",
      reason: "Relevance gate skipped — GEMINI_API_KEY not set.",
      confidence: "low",
    };
  }

  const prompt = `You are a gatekeeper for Lazarus Deal Recovery, a B2B sales deal-judgment product.
Decide if the text is usable sales/deal evidence or irrelevant content.

Return ONLY valid JSON:
{
  "label": "sales_deal" | "not_sales",
  "reason": "one short sentence explaining the decision",
  "confidence": "low" | "medium" | "high"
}

Use label "sales_deal" when the text includes any of:
- sales calls, discovery, demos, proposals, negotiation, pricing, pipeline
- buyer / seller / AE / manager / champion / economic buyer dialogue
- deal emails, objections, stakeholders, CRM notes, forecast or recovery context
- field notes from a customer / prospect meeting

Use label "not_sales" when the text is clearly unrelated, such as:
- recipes, cooking, meal plans
- fiction, homework, sports scores, personal diaries
- pure technical docs with no buyer/seller deal context
- spam, random articles, or content with no commercial opportunity

Rules:
- Prefer "sales_deal" when mixed: if ANY substantial sales/deal thread is present, allow it.
- Prefer "not_sales" only when the dominant content is clearly not deal evidence.
- Be concise in reason. Do not invent people or deals.

EVIDENCE:
${sample.slice(0, SAMPLE_CHARS)}`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = modelCandidatesForTier("free")[0];
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
      },
    });
    const result = await model.generateContent(prompt);
    return parseRelevanceVerdict(result.response.text());
  } catch (err) {
    console.warn("[relevance-gate] classifier failed; failing open:", err);
    return {
      label: "sales_deal",
      reason: "Relevance check failed; proceeding without blocking.",
      confidence: "low",
    };
  }
}

export const relevanceGateTestUtils = {
  parseRelevanceVerdict,
  RELEVANCE_MIN_CHARS,
};
