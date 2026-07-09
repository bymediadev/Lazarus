/**
 * End-to-end live test: POST /api/post-mortem with deep-context fixture.
 * Usage: node --use-system-ca scripts/test-deep-context-live.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.LAZARUS_API_URL ?? "http://localhost:3001";
const fixturePath = join(__dirname, "../fixtures/sample_deep_context.json");
const sample = JSON.parse(readFileSync(fixturePath, "utf-8"));

async function main() {
  const health = await fetch(`${API}/api/health`);
  if (!health.ok) {
    throw new Error(`Health check failed (${health.status})`);
  }
  const healthJson = await health.json();
  console.log("Health:", healthJson);

  const form = new FormData();
  form.append("deal_value", "52000");
  form.append("account_id", sample.account_id);
  form.append("sales_cycle_days", String(sample.sales_cycle_days));
  form.append("historical_crm_context", JSON.stringify(sample.historical_crm_context));
  form.append("live_transcript_payload", JSON.stringify(sample.live_transcript_payload));

  console.log("\nPOST /api/post-mortem (deep-context fixture)...");
  const started = Date.now();
  const res = await fetch(`${API}/api/post-mortem`, { method: "POST", body: form });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const data = await res.json();

  if (!res.ok) {
    console.error(`FAILED (${res.status}) after ${elapsed}s:`, data.error ?? data);
    process.exit(1);
  }

  console.log(`OK in ${elapsed}s\n`);
  console.log("=== LIVE DEAL TRIAGE ===");
  console.log(JSON.stringify(data.live_deal_triage ?? null, null, 2));
  console.log("\n=== FRICTION DELTAS ===");
  console.log(JSON.stringify(data.friction_deltas ?? null, null, 2));
  console.log("\n=== HISTORICAL CONTEXT MATCH ===");
  console.log(JSON.stringify(data.historical_context_match ?? [], null, 2));
  console.log("\n=== IMMEDIATE REMEDIATION ===");
  console.log(JSON.stringify(data.immediate_remediation ?? [], null, 2));
  console.log("\n=== SCORING ===");
  console.log({
    status: data.deal_classification?.status ?? data.deal_status,
    dri: data.proprietary_indices?.deal_risk_index,
    viability: data.viability_state?.viability_score,
    trajectory: data.deal_trajectory?.trajectory_type,
    client: data.client_name,
  });
  console.log("\n=== EXECUTIVE SUMMARY ===");
  console.log(data.executive_summary);
  if (data.warnings?.length) {
    console.log("\n=== WARNINGS ===");
    data.warnings.forEach((w) => console.log("-", w));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
