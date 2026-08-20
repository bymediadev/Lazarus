import { GoogleGenerativeAI } from "@google/generative-ai";
import { ensureBillingCustomer, type ConsumeKind } from "./billing.js";

export type ModelTier = "free" | "entry" | "team";

const FLASH_CHAIN = [
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
];

export function modelTierFromConsume(consume: ConsumeKind | null | undefined): ModelTier {
  if (consume === "team" || consume === "exempt") return "team";
  if (consume === "entry") return "entry";
  return "free";
}

export function modelCandidatesForTier(tier: ModelTier): string[] {
  const flash = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";
  const entry = process.env.GEMINI_MODEL_ENTRY?.trim() || "gemini-2.5-pro";
  const team = process.env.GEMINI_MODEL_TEAM?.trim() || "gemini-3.1-pro-preview";
  const flashChain = [flash, ...FLASH_CHAIN.filter((name) => name !== flash)];

  if (tier === "team") return [...new Set([team, entry, ...flashChain])];
  if (tier === "entry") return [...new Set([entry, ...flashChain])];
  return [...new Set(flashChain)];
}

export function isRetryableGeminiError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /\b(429|404|503)\b/.test(msg) || /high demand|unavailable|overloaded/i.test(msg);
}

export async function resolveModelTierForUser(opts: {
  userId?: string | null;
  consume?: ConsumeKind | null;
  exempt?: boolean;
}): Promise<ModelTier> {
  if (opts.exempt) return "team";
  if (opts.consume) return modelTierFromConsume(opts.consume);
  if (!opts.userId) return "free";
  const row = await ensureBillingCustomer(opts.userId);
  if (!row || row.status !== "active") return "free";
  if (row.plan === "team") return "team";
  if (row.plan === "entry") return "entry";
  return "free";
}

export async function generateGeminiText(prompt: string, tier: ModelTier): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set. Add it to your .env file.");
  }
  const genAI = new GoogleGenerativeAI(apiKey);
  let lastError: unknown;
  for (const modelName of modelCandidatesForTier(tier)) {
    try {
      console.log(`Gemini: trying ${modelName}`);
      const result = await genAI.getGenerativeModel({ model: modelName }).generateContent(prompt);
      return result.response.text();
    } catch (err) {
      lastError = err;
      if (isRetryableGeminiError(err)) {
        console.warn(`Gemini: ${modelName} unavailable, trying next model`);
        continue;
      }
      throw err;
    }
  }
  const detail =
    lastError instanceof Error ? lastError.message.split("\n")[0] : "all models unavailable";
  throw new Error(
    `Gemini quota exceeded. Team quality needs Google billing enabled for Gemini 3.1 Pro.\n\nLast error: ${detail}`
  );
}
