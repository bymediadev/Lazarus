import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildGuideGroundingText, matchGuideOffline } from "../shared/guideContent.js";

export interface GuideChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GuideChatResult {
  answer: string;
  steps: string[];
  /** true when answered from static guide without calling Gemini */
  offline?: boolean;
}

const GUIDE_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

function parseGuideResponse(raw: string): GuideChatResult {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fence ? fence[1].trim() : trimmed;
  try {
    const parsed = JSON.parse(jsonText) as Record<string, unknown>;
    const answer = String(parsed.answer ?? "").trim();
    const steps = Array.isArray(parsed.steps)
      ? parsed.steps.map(String).map((s) => s.trim()).filter(Boolean).slice(0, 8)
      : [];
    if (answer) return { answer, steps };
  } catch {
    /* fall through */
  }
  const lines = trimmed
    .split(/\n+/)
    .map((l) => l.replace(/^\d+[\.)]\s*/, "").trim())
    .filter(Boolean);
  return {
    answer: trimmed.slice(0, 1200),
    steps: lines.length > 1 ? lines.slice(0, 6) : [],
  };
}

function modelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const chain = preferred ? [preferred, ...GUIDE_MODELS] : GUIDE_MODELS;
  return [...new Set(chain)];
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|404|503)\b/.test(msg) || /high demand|unavailable|overloaded/i.test(msg);
}

/** Product-help Q&A only — grounded on static guide content, never deal analysis. */
export async function answerGuideQuestion(
  question: string,
  history: GuideChatMessage[] = []
): Promise<GuideChatResult> {
  const q = question.trim();
  if (q.length < 2) {
    return {
      answer: "Ask how to run an analysis, connect HubSpot, use Live triage, or copy CRM notes.",
      steps: [],
      offline: true,
    };
  }

  // Prefer static how-to for known product questions (works when Gemini is 503).
  const offline = matchGuideOffline(q);
  if (offline) {
    return { ...offline, offline: true };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      answer:
        "Guide AI is offline (no GEMINI_API_KEY). Use the step-by-step workflows above, or ask about HubSpot push, Live triage, or first analysis.",
      steps: [],
      offline: true,
    };
  }

  const grounding = buildGuideGroundingText();
  const prior = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Guide"}: ${m.content}`)
    .join("\n");

  const prompt = `You are the Lazarus Deal Recovery product guide — NOT a sales agent and NOT a deal analyst.
Answer ONLY using the GROUNDING below. If the question is about analyzing a specific deal, scoring, or writing CRM content for a live opportunity, refuse and tell them to use Run Analysis / Fast Facts instead.
For how-to questions, return numbered procedural steps.
Respond with JSON only: {"answer":"string","steps":["step1","step2",...]}
Keep answer under 120 words. Max 6 steps. No markdown fences outside JSON.

GROUNDING:
${grounding}

${prior ? `RECENT:\n${prior}\n` : ""}
USER QUESTION: ${q}`;

  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;

  for (const modelName of modelCandidates()) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      return parseGuideResponse(result.response.text());
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err)) break;
      console.warn(`[guide] model ${modelName} failed, trying next:`, err instanceof Error ? err.message : err);
    }
  }

  // Last resort: any weak offline match already returned; give actionable product help.
  const msg = lastError instanceof Error ? lastError.message : String(lastError);
  const demand = /503|high demand|unavailable/i.test(msg);
  return {
    answer: demand
      ? "Guide AI is temporarily busy. Use the workflows above (Copy CRM-ready notes / Add HubSpot deal history), or retry in a minute."
      : "Guide AI could not answer that right now. Try the step-by-step workflows above, or ask again shortly.",
    steps: [
      "Open a workflow on the left (e.g. Copy CRM-ready notes).",
      "Follow Back / Next for the exact clicks.",
      "Retry Ask a how-to question in a minute if you still need free-form help.",
    ],
    offline: true,
  };
}
