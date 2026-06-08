import { GoogleGenerativeAI } from "@google/generative-ai";
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DealStatus = "failed" | "stalled" | "successful";

export interface PostMortemOutput {
  deal_status: DealStatus;
  client_name: string;
  headline: string;
  diagnosis: string;
  action_plan: string[];
}

const FALLBACK_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

const VALID_STATUSES = new Set<DealStatus>(["failed", "stalled", "successful"]);

function loadSystemPrompt(): string {
  return readFileSync(join(__dirname, "../prompts/final_prompt_v2.txt"), "utf-8");
}

function modelCandidates(): string[] {
  const preferred = process.env.GEMINI_MODEL?.trim();
  const chain = preferred ? [preferred, ...FALLBACK_MODELS] : FALLBACK_MODELS;
  return [...new Set(chain)];
}

function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return msg.includes("429") || msg.includes("404") || msg.includes("503");
}

function quotaErrorMessage(lastError: unknown): string {
  const base =
    "Gemini quota exceeded for all available models. Wait a few minutes, create a new API key at https://aistudio.google.com/apikey, or set GEMINI_MODEL in .env to a model your project can use.";
  if (lastError instanceof Error && lastError.message) {
    return `${base}\n\nLast error: ${lastError.message.split("\n")[0]}`;
  }
  return base;
}

function normalizeStatus(value: unknown): DealStatus {
  const status = String(value ?? "stalled").toLowerCase().trim();
  if (VALID_STATUSES.has(status as DealStatus)) {
    return status as DealStatus;
  }
  if (status.includes("fail") || status.includes("lost") || status.includes("dead")) {
    return "failed";
  }
  if (status.includes("success") || status.includes("won") || status.includes("closed won")) {
    return "successful";
  }
  return "stalled";
}

function normalizeOutput(raw: Record<string, unknown>): PostMortemOutput {
  const headline = String(raw.headline ?? raw.stall_cause ?? "").trim();
  const diagnosis = String(raw.diagnosis ?? raw.why_it_stalled ?? "").trim();
  const action_plan = Array.isArray(raw.action_plan)
    ? raw.action_plan.map(String)
    : Array.isArray(raw.restart_plan)
      ? raw.restart_plan.map(String)
      : [];

  const deal_status = normalizeStatus(raw.deal_status);

  if (!headline || !diagnosis || action_plan.length === 0) {
    throw new Error("Gemini returned an invalid analysis structure.");
  }

  return {
    deal_status,
    client_name: String(raw.client_name ?? "Unknown Deal"),
    headline,
    diagnosis,
    action_plan,
  };
}

function toApiResponse(result: PostMortemOutput): PostMortemOutput & {
  stall_cause: string;
  why_it_stalled: string;
  restart_plan: string[];
} {
  return {
    ...result,
    stall_cause: result.headline,
    why_it_stalled: result.diagnosis,
    restart_plan: result.action_plan,
  };
}

async function generateWithModel(
  apiKey: string,
  modelName: string,
  systemPrompt: string,
  userMessage: string
): Promise<PostMortemOutput & { stall_cause: string; why_it_stalled: string; restart_plan: string[] }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.3,
    },
  });

  const result = await model.generateContent([
    { text: systemPrompt },
    { text: userMessage },
  ]);

  const text = result.response.text();
  const parsed = JSON.parse(text) as Record<string, unknown>;
  return toApiResponse(normalizeOutput(parsed));
}

export async function analyzeTranscript(
  transcript: string,
  dealValue: number
): Promise<PostMortemOutput & { stall_cause: string; why_it_stalled: string; restart_plan: string[] }> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }

  const systemPrompt = loadSystemPrompt();
  const userMessage = `DEAL VALUE: $${dealValue.toLocaleString()}

Classify deal_status from prospect dialogue and behavioral evidence in the transcript below — not from CRM labels, metadata, or rep summaries.

TRANSCRIPT:
${transcript}`;

  const candidates = modelCandidates();
  let lastError: unknown;

  for (const modelName of candidates) {
    try {
      console.log(`Gemini: trying ${modelName}`);
      return await generateWithModel(apiKey, modelName, systemPrompt, userMessage);
    } catch (err) {
      lastError = err;
      if (isRetryableGeminiError(err)) {
        console.warn(`Gemini: ${modelName} unavailable, trying next model`);
        continue;
      }
      throw err;
    }
  }

  throw new Error(quotaErrorMessage(lastError));
}
