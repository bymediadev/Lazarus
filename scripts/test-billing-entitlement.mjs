import { ENTRY_PERIOD_CAP, evaluateCanAnalyze, featureAccessFromRow, FREE_ANALYSIS_CAP } from "../server/billing.ts";
import { modelCandidatesForTier, modelTierFromConsume } from "../server/modelForPlan.ts";

function row(partial) {
  return {
    user_id: "u1",
    stripe_customer_id: null,
    stripe_subscription_id: null,
    plan: "free",
    status: "none",
    free_used: 0,
    ppu_credits: 0,
    entry_used_this_period: 0,
    period_start: null,
    period_end: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...partial,
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(evaluateCanAnalyze(row({ free_used: 0 })).can === true, "free remaining should analyze");
assert(evaluateCanAnalyze(row({ free_used: FREE_ANALYSIS_CAP })).can === false, "free exhausted should block");
assert(evaluateCanAnalyze(row({ free_used: 5, ppu_credits: 1 })).consume === "ppu", "ppu credits after free");
assert(
  evaluateCanAnalyze(row({ plan: "entry", status: "active", free_used: 5, entry_used_this_period: 0 })).consume ===
    "entry",
  "entry plan consumes entry"
);
assert(
  evaluateCanAnalyze(
    row({ plan: "entry", status: "active", free_used: 5, entry_used_this_period: ENTRY_PERIOD_CAP })
  ).can === false,
  "entry exhausted should block"
);
assert(
  evaluateCanAnalyze(row({ plan: "team", status: "active", free_used: 5 })).consume === "team",
  "team unlimited"
);
assert(evaluateCanAnalyze(row({ plan: "team", status: "past_due" })).can === false, "past due blocks");
assert(featureAccessFromRow(row({ plan: "free" })).lifecycle === false, "free has no lifecycle");
assert(featureAccessFromRow(row({ plan: "ppu", status: "active" })).lifecycle === false, "ppu has no lifecycle");
assert(featureAccessFromRow(row({ plan: "entry", status: "active" })).lifecycle === true, "entry has lifecycle");
assert(featureAccessFromRow(row({ plan: "entry", status: "active" })).whitewhale === false, "entry has no whitewhale");
assert(featureAccessFromRow(row({ plan: "team", status: "active" })).whitewhale === true, "team has whitewhale");
assert(featureAccessFromRow(row({ plan: "team", status: "past_due" })).lifecycle === false, "past due no lifecycle");

assert(modelTierFromConsume("free") === "free", "free consume uses flash tier");
assert(modelTierFromConsume("ppu") === "free", "ppu consume uses flash tier");
assert(modelTierFromConsume("entry") === "entry", "entry consume uses pro tier");
assert(modelTierFromConsume("team") === "team", "team consume uses 3.1 pro tier");
assert(modelTierFromConsume("exempt") === "team", "exempt consume uses team tier");
assert(
  modelCandidatesForTier("free")[0] === (process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash"),
  "free primary is flash"
);
assert(
  modelCandidatesForTier("entry")[0] === (process.env.GEMINI_MODEL_ENTRY?.trim() || "gemini-2.5-pro"),
  "entry primary is 2.5 pro"
);
assert(
  modelCandidatesForTier("team")[0] === (process.env.GEMINI_MODEL_TEAM?.trim() || "gemini-3.1-pro-preview"),
  "team primary is 3.1 pro"
);
assert(modelCandidatesForTier("team").includes("gemini-2.5-pro"), "team falls back to 2.5 pro");
console.log("billing entitlement checks passed");
