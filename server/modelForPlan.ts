import { ensureBillingCustomer, evaluateCanAnalyze, type ConsumeKind } from "./billing.js";
import { modelCandidatesForTier, type ModelTier } from "./geminiModels.js";
import { generateText, isRetryableLlmError } from "./llmProviders.js";

export type { ModelTier };
export { modelCandidatesForTier };

export function modelTierFromConsume(consume: ConsumeKind | null | undefined): ModelTier {
  if (consume === "team" || consume === "exempt") return "team";
  if (consume === "entry") return "entry";
  return "free";
}

/** The 5 free runs (no signup or Free plan). Paid / founder stay on the paid model order. */
export function preferOpenWeightsFor(opts: {
  userId?: string | null;
  consume?: ConsumeKind | null;
  exempt?: boolean;
}): boolean {
  if (opts.exempt) return false;
  if (opts.consume === "guest" || opts.consume === "free") return true;
  return !opts.userId;
}

/** Live routes do not reserve a slot; the 5 free runs still use the free model order. */
export async function consumeForLlmRoute(
  userId?: string | null,
  exempt?: boolean
): Promise<ConsumeKind | undefined> {
  if (exempt) return "exempt";
  if (!userId) return "guest";
  const row = await ensureBillingCustomer(userId);
  if (!row) return "free";
  return evaluateCanAnalyze(row).consume;
}

export function isRetryableGeminiError(err: unknown): boolean {
  return isRetryableLlmError(err);
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

/** Live/gate/guide text. Free runs and paid runs both start on Gemini Flash when that key exists. */
export async function generateGeminiText(
  prompt: string,
  _tier?: ModelTier,
  opts: { preferOpenWeights?: boolean } = {}
): Promise<string> {
  return generateText(prompt, { job: "live", preferOpenWeights: opts.preferOpenWeights });
}
