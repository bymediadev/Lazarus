import { generateGeminiText } from "./modelForPlan.js";
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

  try {
    const raw = await generateGeminiText(prompt, "free");
    return parseGuideResponse(raw);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const demand = /503|high demand|unavailable|quota/i.test(msg);
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
}
