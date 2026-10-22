/**
 * Local check: cold-qualify matrix + live /api/post-mortem with company context.
 * Usage: node --import tsx scripts/test-cold-qualify-live.mjs
 */
import { readFileSync, writeFileSync } from "fs";
import { buildDeepContextMessageBlock } from "../server/deepContext.ts";
import { readCompanyProfile } from "../server/companyProfile.ts";
import { diagnosticProfile, parseTurns, purchaseMotion } from "../src/lib/reportMatrix.ts";
import { formatCompanyScoreContext } from "../src/qualifier/brief.ts";
import { readTeaser, scoreVerdict } from "../src/qualifier/teaser.ts";

const API = process.env.API_BASE?.replace(/\/$/, "") || "http://127.0.0.1:3001";
const transcript = readFileSync("fixtures/daniel_cold_qualification_full.txt", "utf8");

let failed = 0;
function check(name, ok) {
  if (ok) console.log(`ok  ${name}`);
  else {
    failed += 1;
    console.error(`FAIL ${name}`);
  }
}

const turns = parseTurns(transcript);
const sellers = [...new Set(turns.turns.filter((t) => t.role === "seller").map((t) => t.speaker))];
const buyers = [...new Set(turns.turns.filter((t) => t.role === "buyer").map((t) => t.speaker))];
const motion = purchaseMotion(transcript);
const diagnostic = diagnosticProfile(transcript);

console.log("\n--- Local matrix ---");
console.log("sellers:", sellers.join(", ") || "(none)");
console.log("buyers:", buyers.join(", ") || "(none)");
console.log("labeled:", turns.labeled);
console.log("motion:", motion.motion, "—", motion.reason);
console.log("urgency:", diagnostic.urgency);
console.log("budget:", diagnostic.budget);
console.log("buyingSignals:", diagnostic.buyingSignals);
console.log("falseRead:", diagnostic.falseRead || "(none)");

check("Marcus is seller", sellers.includes("Marcus") && !buyers.includes("Marcus"));
check("Daniel is buyer", buyers.includes("Daniel") && !sellers.includes("Daniel"));
check("Scenario/Participants are not speakers", !sellers.includes("Scenario") && !buyers.includes("Participants"));
check("pain is not a purchase", motion.motion === "unresolved" || motion.motion === "closed");
check(
  "worded timelines stay (not 'ago' urgency)",
  /timeline was stated|five months|three weeks|six to eight|six-to-eight/i.test(diagnostic.urgency) &&
    !/\bago\b/i.test(diagnostic.urgency)
);

const companyUrl = "example.com";
const lookedUp = await readCompanyProfile(companyUrl);
const companyContext = {
  domain: lookedUp.domain || "example.com",
  profile: lookedUp.profile,
  account: "Northstar Industrial Group",
  amount: "$80,000",
};
const prefixed = `${formatCompanyScoreContext(companyContext)}\n\n${transcript}`;
const deep = buildDeepContextMessageBlock({ companyContext, accountId: companyContext.domain });
check("site profile fetched or soft-failed cleanly", Boolean(companyContext.domain && companyContext.profile));
check("context block is not dialogue", /not call dialogue/i.test(formatCompanyScoreContext(companyContext)));
check("deep context orients engine", /COMPANY CONTEXT/.test(deep) && deep.includes("Northstar"));

// Prefixed transcript must not flip seller/buyer or invent purchase from site copy
const prefixedMotion = purchaseMotion(prefixed);
const prefixedTurns = parseTurns(prefixed);
check(
  "prefix does not invent purchase",
  prefixedMotion.motion === motion.motion || prefixedMotion.motion === "unresolved"
);
check(
  "prefix does not make Marcus a buyer",
  !prefixedTurns.turns.some((t) => t.speaker === "Marcus" && t.role === "buyer")
);

console.log("\n--- Live score ---");
console.log("company:", companyContext);

const form = new FormData();
form.append("transcript", transcript);
form.append("deal_value", "0");
form.append("off_hours", "1");
form.append("force_analysis", "1");
form.append("company_url", companyUrl);
form.append("account_name", companyContext.account);
form.append("amount_at_risk", companyContext.amount);
form.append("account_id", companyContext.domain);

const started = Date.now();
let res;
try {
  res = await fetch(`${API}/api/post-mortem`, { method: "POST", body: form });
} catch (err) {
  console.error("API unreachable:", err instanceof Error ? err.message : err);
  process.exit(1);
}

const body = await res.json().catch(() => ({}));
const ms = Date.now() - started;
console.log(`HTTP ${res.status} in ${ms}ms`);

if (!res.ok) {
  console.error("error:", body.error || body);
  writeFileSync("fixtures/_cold-qualify-live-error.json", `${JSON.stringify(body, null, 2)}\n`);
  process.exit(1);
}

const teaser = readTeaser(body);
const verdict = scoreVerdict(body);
const ctx = body.company_context;

console.log("verdict:", verdict);
console.log("teaser:", teaser);
console.log("company_context:", ctx);
console.log("client_name:", body.client_name);
console.log("blocker:", body.primary_blocker || body.blocker || teaser?.blocker);
console.log("risk:", body.deal_risk_index ?? teaser?.risk);
console.log("warnings:", body.warnings ?? []);

check("company_context returned", Boolean(ctx?.domain));
check("company_context keeps account", ctx?.account === "Northstar Industrial Group");
check("company_context keeps amount", ctx?.amount === "$80,000");
check("verdict is readable", ["Flat no", "Checkpoint", "Recoverable"].includes(verdict));
check(
  "does not treat pain as open purchase (checkpoint or flat no preferred)",
  verdict === "Checkpoint" || verdict === "Flat no" || (verdict === "Recoverable" && /not|no purchase|unresolved/i.test(String(teaser?.blocker ?? "")))
);
check(
  "blocker is no-purchase, not speakers-unread",
  /no purchase/i.test(String(teaser?.blocker ?? "")) && !/speakers are not established/i.test(String(teaser?.blocker ?? ""))
);
check(
  "summary is no-purchase, not speakers-unread",
  /no purchase/i.test(String(body.executive_summary ?? "")) && !/speakers could not be read/i.test(String(body.executive_summary ?? ""))
);

writeFileSync(
  "fixtures/_cold-qualify-live-result.json",
  `${JSON.stringify(
    {
      verdict,
      teaser,
      company_context: ctx,
      deal_risk_index: body.deal_risk_index,
      risk_tier: body.risk_tier,
      primary_blocker: body.primary_blocker,
      executive_summary: body.executive_summary,
      this_week: body.this_week_actions ?? body.recommended_actions,
      warnings: body.warnings,
      matrix: { sellers, buyers, motion, diagnostic },
    },
    null,
    2
  )}\n`
);

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\ncold-qualify live checks passed");
console.log("wrote fixtures/_cold-qualify-live-result.json");
