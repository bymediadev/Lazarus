import { GoogleGenerativeAI } from "@google/generative-ai";
import { modelCandidatesForTier, type ModelTier } from "./geminiModels.js";
import { secureFetch } from "./secureFetch.js";

export type LlmJob = "autopsy" | "live";
export type LlmProviderId = "gemini" | "cerebras" | "openrouter" | "groq";

export type LlmCandidate = {
  provider: LlmProviderId;
  model: string;
};

const CEREBRAS_BASE = "https://api.cerebras.ai/v1";
const GROQ_BASE = "https://api.groq.com/openai/v1";
const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

const DEFAULT_CEREBRAS_AUTOPSY = ["llama-3.3-70b", "qwen-3-32b", "gpt-oss-120b"];
const DEFAULT_CEREBRAS_LIVE = ["llama3.1-8b"];

const DEFAULT_GROQ_AUTOPSY = [
  "qwen/qwen3-32b",
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
];
const DEFAULT_GROQ_LIVE = ["llama-3.1-8b-instant"];
const DEFAULT_OPENROUTER_AUTOPSY = [
  "poolside/laguna-s-2.1:free",
  "minimax/minimax-m2.7:free",
  "nvidia/nemotron-3.5-lightning:free",
  "google/gemma-4-31b-it:free",
];
const DEFAULT_OPENROUTER_LIVE = [
  "nvidia/nemotron-3.5-lightning:free",
  "liquid/lfm-2.5-2.6b:free",
  "poolside/laguna-xs-2.1:free",
  "google/gemma-4-26b-a4b-it:free",
];

function csvEnv(name: string, fallback: string[]): string[] {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  return [...new Set(raw.split(",").map((s) => s.trim()).filter(Boolean))];
}

export function geminiApiKey(): string {
  return (process.env.GEMINI_API_KEY ?? "").trim();
}

export function cerebrasApiKey(): string {
  return (process.env.CEREBRAS_API_KEY ?? "").trim();
}

export function groqApiKey(): string {
  return (process.env.GROQ_API_KEY ?? "").trim();
}

export function openRouterApiKey(): string {
  return (process.env.OPENROUTER_API_KEY ?? "").trim();
}

export function hasGeminiKey(): boolean {
  return geminiApiKey().length > 0;
}

export function hasCerebrasKey(): boolean {
  return cerebrasApiKey().length > 0;
}

export function hasGroqKey(): boolean {
  return groqApiKey().length > 0;
}

export function hasOpenRouterKey(): boolean {
  return openRouterApiKey().length > 0;
}

export function hasAnyLlmProvider(): boolean {
  return hasGeminiKey() || hasCerebrasKey() || hasOpenRouterKey() || hasGroqKey();
}

export function llmKeyFlags(): {
  gemini: boolean;
  cerebras: boolean;
  openrouter: boolean;
  groq: boolean;
} {
  return {
    gemini: hasGeminiKey(),
    cerebras: hasCerebrasKey(),
    openrouter: hasOpenRouterKey(),
    groq: hasGroqKey(),
  };
}

export function cerebrasAutopsyModels(): string[] {
  return csvEnv("CEREBRAS_MODEL_AUTOPSY", DEFAULT_CEREBRAS_AUTOPSY);
}

export function cerebrasLiveModels(): string[] {
  return csvEnv("CEREBRAS_MODEL_LIVE", DEFAULT_CEREBRAS_LIVE);
}

export function groqAutopsyModels(): string[] {
  return csvEnv("GROQ_MODEL_AUTOPSY", DEFAULT_GROQ_AUTOPSY);
}

export function groqLiveModels(): string[] {
  return csvEnv("GROQ_MODEL_LIVE", DEFAULT_GROQ_LIVE);
}

export function openRouterAutopsyModels(): string[] {
  return csvEnv("OPENROUTER_MODEL_AUTOPSY", DEFAULT_OPENROUTER_AUTOPSY);
}

export function openRouterLiveModels(): string[] {
  return csvEnv("OPENROUTER_MODEL_LIVE", DEFAULT_OPENROUTER_LIVE);
}

export type LlmGenerateOpts = {
  job?: LlmJob;
  tier?: ModelTier;
  /** The 5 free runs: OpenRouter only (Gemini is not in this chain). */
  preferOpenWeights?: boolean;
};

export function llmCandidatesForJob(
  job: LlmJob,
  tier: ModelTier = "free",
  opts: { preferOpenWeights?: boolean } = {}
): LlmCandidate[] {
  const geminiTier = job === "live" ? "free" : tier;
  const gemini: LlmCandidate[] = hasGeminiKey()
    ? modelCandidatesForTier(geminiTier).map((model) => ({ provider: "gemini" as const, model }))
    : [];
  const cerebras: LlmCandidate[] = hasCerebrasKey()
    ? (job === "autopsy" ? cerebrasAutopsyModels() : cerebrasLiveModels()).map((model) => ({
        provider: "cerebras" as const,
        model,
      }))
    : [];
  const openrouter: LlmCandidate[] = hasOpenRouterKey()
    ? (job === "autopsy" ? openRouterAutopsyModels() : openRouterLiveModels()).map((model) => ({
        provider: "openrouter" as const,
        model,
      }))
    : [];
  const groq: LlmCandidate[] = hasGroqKey()
    ? (job === "autopsy" ? groqAutopsyModels() : groqLiveModels()).map((model) => ({
        provider: "groq" as const,
        model,
      }))
    : [];

  if (opts.preferOpenWeights) {
    const freePath = [...openrouter, ...groq];
    // Free runs stay on OpenRouter. Gemini only if no free spare is configured yet.
    return freePath.length > 0 ? freePath : gemini;
  }
  return [...gemini, ...openrouter, ...groq, ...cerebras];
}

export function isRetryableLlmError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /\b(429|404|502|503|529)\b/.test(msg) ||
    /high demand|unavailable|overloaded|rate[_ ]?limit|too many requests|no healthy upstream|model_not_found|fetch failed|ECONNREFUSED|ENOTFOUND|ETIMEDOUT|socket hang up|network/i.test(
      msg
    )
  );
}

export function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fence ? fence[1].trim() : trimmed;
  if (text.startsWith("{") || text.startsWith("[")) return text;
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text;
}

function noProviderError(): Error {
  return new Error(
    "No LLM provider configured. Set GEMINI_API_KEY, or a free OPENROUTER_API_KEY failover. See docs/llm-failover.md."
  );
}

function allFailedError(lastError: unknown): Error {
  const detail =
    lastError instanceof Error ? lastError.message.split("\n")[0] : "all models unavailable";
  return new Error(
    `All LLM providers failed (Gemini, then OpenRouter).\n\nLast error: ${detail}\n\nAdd a free OPENROUTER_API_KEY at https://openrouter.ai/keys.`
  );
}

function openRouterHeaders(): Record<string, string> {
  const origin = (process.env.FRONTEND_ORIGIN ?? "https://www.getldr.ca")
    .split(",")[0]
    .trim();
  return {
    "HTTP-Referer": origin || "https://www.getldr.ca",
    "X-Title": "Lazarus Deal Recovery",
  };
}

async function generateGemini(
  modelName: string,
  parts: string[],
  json: boolean
): Promise<string> {
  const apiKey = geminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: json
      ? { responseMimeType: "application/json", temperature: 0 }
      : { temperature: 0 },
  });
  const result = await model.generateContent(parts.map((text) => ({ text })));
  return result.response.text();
}

async function generateOpenAiCompat(opts: {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: "system" | "user"; content: string }[];
  json: boolean;
  extraHeaders?: Record<string, string>;
}): Promise<string> {
  const res = await secureFetch(`${opts.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      ...(opts.extraHeaders ?? {}),
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0,
      messages: opts.messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  const body = await res.text();
  if (!res.ok) {
    if (
      opts.json &&
      (res.status === 400 || /response_format|json_object/i.test(body))
    ) {
      return generateOpenAiCompat({ ...opts, json: false });
    }
    throw new Error(`${opts.model} ${res.status}: ${body.slice(0, 400)}`);
  }
  let data: {
    choices?: Array<{
      message?: { content?: string | null; reasoning?: string | null };
    }>;
  };
  try {
    data = JSON.parse(body) as typeof data;
  } catch {
    throw new Error(`${opts.model} returned non-JSON: ${body.slice(0, 200)}`);
  }
  const msg = data.choices?.[0]?.message;
  const content = String(msg?.content ?? msg?.reasoning ?? "").trim();
  if (!content) {
    throw new Error(`${opts.model} returned empty content`);
  }
  return content;
}

async function generateWithCandidate(
  candidate: LlmCandidate,
  messages: { role: "system" | "user"; content: string }[],
  json: boolean
): Promise<string> {
  console.log(`LLM: trying ${candidate.provider}/${candidate.model}`);
  if (candidate.provider === "gemini") {
    const parts = messages.map((m) => m.content);
    return generateGemini(candidate.model, parts, json);
  }
  if (candidate.provider === "cerebras") {
    return generateOpenAiCompat({
      baseUrl: CEREBRAS_BASE,
      apiKey: cerebrasApiKey(),
      model: candidate.model,
      messages,
      json,
    });
  }
  if (candidate.provider === "groq") {
    return generateOpenAiCompat({
      baseUrl: GROQ_BASE,
      apiKey: groqApiKey(),
      model: candidate.model,
      messages,
      json,
    });
  }
  return generateOpenAiCompat({
    baseUrl: OPENROUTER_BASE,
    apiKey: openRouterApiKey(),
    model: candidate.model,
    messages,
    json,
    extraHeaders: openRouterHeaders(),
  });
}

async function runCandidates(
  candidates: LlmCandidate[],
  messages: { role: "system" | "user"; content: string }[],
  json: boolean
): Promise<string> {
  if (candidates.length === 0) throw noProviderError();
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await generateWithCandidate(candidate, messages, json);
    } catch (err) {
      lastError = err;
      if (isRetryableLlmError(err)) {
        console.warn(
          `LLM: ${candidate.provider}/${candidate.model} unavailable, trying next`
        );
        continue;
      }
      throw err;
    }
  }
  throw allFailedError(lastError);
}

export async function generateText(
  prompt: string,
  opts: LlmGenerateOpts = {}
): Promise<string> {
  const job = opts.job ?? "live";
  const candidates = llmCandidatesForJob(job, opts.tier ?? "free", {
    preferOpenWeights: opts.preferOpenWeights,
  });
  return runCandidates(candidates, [{ role: "user", content: prompt }], true);
}

export async function generateJson(
  systemPrompt: string,
  userMessage: string,
  opts: LlmGenerateOpts = {}
): Promise<Record<string, unknown>> {
  const job = opts.job ?? "autopsy";
  const candidates = llmCandidatesForJob(job, opts.tier ?? "free", {
    preferOpenWeights: opts.preferOpenWeights,
  });
  const raw = await runCandidates(
    candidates,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    true
  );
  try {
    return JSON.parse(extractJsonText(raw)) as Record<string, unknown>;
  } catch {
    throw new Error("LLM returned invalid JSON");
  }
}
