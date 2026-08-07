import { GoogleGenerativeAI } from "@google/generative-ai";
import { buildGuideGroundingText } from "../shared/guideContent.js";

export interface GuideChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface GuideChatResult {
  answer: string;
  steps: string[];
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
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }

  const q = question.trim();
  if (q.length < 2) {
    return {
      answer: "Ask how to run an analysis, connect HubSpot, use Live triage, or copy CRM notes.",
      steps: [],
    };
  }

  const grounding = buildGuideGroundingText();
  const prior = history
    .slice(-6)
    .map((m) => `${m.role === "user" ? "User" : "Guide"}: ${m.content}`)
    .join("\n");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash",
  });

  const prompt = `You are the Lazarus Deal Recovery product guide — NOT a sales agent and NOT a deal analyst.
Answer ONLY using the GROUNDING below. If the question is about analyzing a specific deal, scoring, or writing CRM content for a live opportunity, refuse and tell them to use Run Analysis / Fast Facts instead.
For how-to questions, return numbered procedural steps.
Respond with JSON only: {"answer":"string","steps":["step1","step2",...]}
Keep answer under 120 words. Max 6 steps. No markdown fences outside JSON.

GROUNDING:
${grounding}

${prior ? `RECENT:\n${prior}\n` : ""}
USER QUESTION: ${q}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  return parseGuideResponse(text);
}
