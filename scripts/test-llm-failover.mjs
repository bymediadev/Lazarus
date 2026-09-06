import {
  extractJsonText,
  isRetryableLlmError,
  llmCandidatesForJob,
  openRouterAutopsyModels,
  openRouterLiveModels,
} from "../server/llmProviders.ts";
import { modelCandidatesForTier, preferOpenWeightsFor } from "../server/modelForPlan.ts";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const saved = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  CEREBRAS_API_KEY: process.env.CEREBRAS_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
};

function restore() {
  for (const [k, v] of Object.entries(saved)) {
    if (v == null) delete process.env[k];
    else process.env[k] = v;
  }
}

try {
  process.env.GEMINI_API_KEY = "AIza-test";
  process.env.CEREBRAS_API_KEY = "csk-test";
  process.env.GROQ_API_KEY = "gsk-test";
  process.env.OPENROUTER_API_KEY = "or-test";

  const autopsy = llmCandidatesForJob("autopsy", "entry");
  assert(autopsy[0].provider === "gemini", "autopsy starts with Gemini");
  assert(autopsy[0].model === modelCandidatesForTier("entry")[0], "entry Gemini primary is Pro");
  const providers = autopsy.map((c) => c.provider);
  assert(providers.includes("openrouter"), "autopsy includes OpenRouter");
  assert(providers.indexOf("openrouter") < providers.indexOf("cerebras"), "OpenRouter before paid Cerebras");
  assert(
    autopsy.some((c) => c.provider === "openrouter" && c.model === openRouterAutopsyModels()[0]),
    "autopsy OpenRouter uses pinned :free models"
  );

  const live = llmCandidatesForJob("live", "team");
  assert(live[0].provider === "gemini", "live starts with Gemini");
  assert(live[0].model === modelCandidatesForTier("free")[0], "live Gemini stays on Flash, not Team Pro");
  assert(
    live.some((c) => c.provider === "openrouter" && openRouterLiveModels().includes(c.model)),
    "live uses small OpenRouter :free"
  );

  const guestAutopsy = llmCandidatesForJob("autopsy", "free", { preferOpenWeights: true });
  assert(guestAutopsy[0].provider === "openrouter", "guest 5-free autopsy starts on OpenRouter");
  assert(
    !guestAutopsy.some((c) => c.provider === "gemini"),
    "five free runs do not call Gemini when OpenRouter is configured"
  );

  assert(preferOpenWeightsFor({ userId: null }) === true, "anonymous prefers open weights");
  assert(preferOpenWeightsFor({ consume: "guest" }) === true, "guest consume prefers open weights");
  assert(preferOpenWeightsFor({ userId: "u1", consume: "free" }) === true, "signed-in free plan uses OpenRouter");
  assert(preferOpenWeightsFor({ userId: "u1", consume: "ppu" }) === false, "paid extra report stays Gemini-first");
  assert(preferOpenWeightsFor({ userId: "u1", exempt: true }) === false, "founder exempt stays Gemini-first");

  process.env.OPENROUTER_API_KEY = "";
  process.env.GROQ_API_KEY = "";
  const guestNoSpare = llmCandidatesForJob("autopsy", "free", { preferOpenWeights: true });
  assert(guestNoSpare[0].provider === "gemini", "free runs fall back to Gemini if OpenRouter is unset");

  process.env.GEMINI_API_KEY = "";
  process.env.OPENROUTER_API_KEY = "or-test";
  const openRouterFirst = llmCandidatesForJob("autopsy", "free");
  assert(openRouterFirst[0].provider === "openrouter", "without Gemini, OpenRouter is first");

  assert(isRetryableLlmError(new Error("503 high demand")), "503 is retryable");
  assert(isRetryableLlmError(new Error("429 rate_limit")), "429 is retryable");
  assert(isRetryableLlmError(new Error("fetch failed")), "Gemini host down is retryable");
  assert(!isRetryableLlmError(new Error("invalid analysis structure")), "parse errors are not retryable");

  const fenced = extractJsonText('sure\n```json\n{"label":"sales_deal"}\n```');
  assert(fenced === '{"label":"sales_deal"}', "extracts fenced JSON");
  const wrapped = extractJsonText('Thinking...\n{"a":1}');
  assert(wrapped === '{"a":1}', "extracts first JSON object");

  console.log("llm failover checks passed");
} finally {
  restore();
}
