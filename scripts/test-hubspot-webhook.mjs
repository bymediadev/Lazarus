/**
 * POST HubSpot deal webhook fixture → /api/webhooks/hubspot and verify mapped output.
 * Usage: node --use-system-ca scripts/test-hubspot-webhook.mjs
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API = process.env.LAZARUS_API_URL ?? "http://localhost:3001";
const fixturePath = join(__dirname, "../fixtures/sample_hubspot_deal_webhook.json");
const payload = JSON.parse(readFileSync(fixturePath, "utf-8"));

async function main() {
  const health = await fetch(`${API}/api/health`);
  if (!health.ok) {
    throw new Error(`Health check failed (${health.status})`);
  }
  console.log("Health OK");

  const headers = { "Content-Type": "application/json" };
  const secret = process.env.HUBSPOT_WEBHOOK_SECRET;
  if (secret) headers["x-hubspot-signature"] = secret;

  console.log("\nPOST /api/webhooks/hubspot ...");
  const res = await fetch(`${API}/api/webhooks/hubspot`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    console.error(`FAILED (${res.status}):`, data.error ?? data);
    process.exit(1);
  }

  console.log("Mapped deep context:\n", JSON.stringify(data.mapped, null, 2));

  const mapped = data.mapped;
  const checks = [
    ["account_id", mapped?.account_id === "4829103756"],
    ["sales_cycle_days", mapped?.sales_cycle_days === 142],
    ["historical entries", (mapped?.historical_crm_context?.length ?? 0) === 3],
    [
      "veto holder objects",
      mapped?.historical_crm_context?.some((e) =>
        e.past_identified_veto_holders?.some((v) => v.veto_holder_id && v.display_name)
      ),
    ],
    ["legacy string veto compat", mapped?.historical_crm_context?.[0]?.past_identified_veto_holders?.length >= 1],
  ];

  let failed = false;
  for (const [label, ok] of checks) {
    console.log(ok ? "✓" : "✗", label);
    if (!ok) failed = true;
  }

  if (failed) {
    console.error("\nHubSpot webhook mapping checks FAILED");
    process.exit(1);
  }

  console.log("\nHUBSPOT WEBHOOK OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
