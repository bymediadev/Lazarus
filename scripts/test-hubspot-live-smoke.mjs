/**
 * Live HubSpot smoke: status → search → import notes (requires connected OAuth).
 *
 * Usage (API must be running, e.g. npm run dev):
 *   npm run test:hubspot:live
 *   node --import tsx scripts/test-hubspot-live-smoke.mjs "Spec Kitty"
 *
 * Env:
 *   API_BASE / VITE_API_URL — default http://localhost:3001
 *   LAZARUS_API_KEY / VITE_LAZARUS_API_KEY — optional X-Api-Key
 */
import "dotenv/config";

const API_BASE = (
  process.env.API_BASE ||
  process.env.VITE_API_URL ||
  "http://localhost:3001"
).replace(/\/$/, "");

const apiKey = (
  process.env.LAZARUS_API_KEY ||
  process.env.VITE_LAZARUS_API_KEY ||
  ""
).trim();

const query =
  process.argv.slice(2).join(" ").trim() ||
  process.env.HUBSPOT_SMOKE_QUERY ||
  "deal";

let failed = 0;

function check(label, condition) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    failed++;
  } else {
    console.log(`OK: ${label}`);
  }
}

function headers(json = false) {
  const h = {};
  if (json) h["Content-Type"] = "application/json";
  if (apiKey) h["X-Api-Key"] = apiKey;
  return h;
}

async function main() {
  console.log(`API_BASE=${API_BASE}`);
  console.log(`search query=${JSON.stringify(query)}`);

  let statusRes;
  try {
    statusRes = await fetch(`${API_BASE}/api/integrations/hubspot/status`, {
      headers: headers(),
    });
  } catch (err) {
    console.error(
      `FAIL: cannot reach API at ${API_BASE} — start with npm run dev (${err instanceof Error ? err.message : err})`
    );
    process.exit(1);
  }

  const status = await statusRes.json();
  check("status endpoint ok", statusRes.ok);
  check("HubSpot OAuth configured (CLIENT_ID/SECRET)", status.configured === true);
  check("HubSpot connected (OAuth complete)", status.connected === true);

  if (!status.configured) {
    console.error("");
    console.error("Configure HubSpot first — see docs/hubspot-setup.md");
    console.error(
      "  node scripts/apply-hubspot-env.mjs --id <client_id> --secret <client_secret>"
    );
    process.exit(1);
  }

  if (!status.connected) {
    console.error("");
    console.error("HubSpot is configured but not connected.");
    console.error(`Open: ${API_BASE}/api/integrations/hubspot/connect`);
    console.error("Or click Connect HubSpot in Deal Profile, then re-run this smoke.");
    process.exit(1);
  }

  check(
    "account identity present",
    Boolean(status.account_email || status.hub_domain)
  );

  const searchRes = await fetch(`${API_BASE}/api/integrations/hubspot/search-deals`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ query }),
  });
  const search = await searchRes.json();
  check("search-deals ok", searchRes.ok && search.ok === true);
  check("search returned deals array", Array.isArray(search.deals));

  if (!search.deals?.length) {
    console.error("");
    console.error(
      `No deals matched ${JSON.stringify(query)}. Try a broader name that exists in the Hub.`
    );
    process.exit(1);
  }

  const deal = search.deals[0];
  console.log(`Using deal: ${deal.dealname} (${deal.id})`);

  const importRes = await fetch(`${API_BASE}/api/integrations/hubspot/import-deal-notes`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ dealId: deal.id }),
  });
  const imported = await importRes.json();
  check("import-deal-notes ok", importRes.ok && imported.ok === true);
  check("import includes deal", Boolean(imported.deal?.id));
  check("note_count is a number", typeof imported.note_count === "number");
  check("account_id mapped", Boolean(imported.account_id));
  check(
    "historical_crm_context is array",
    Array.isArray(imported.historical_crm_context)
  );
  check(
    "sales_cycle_days present",
    imported.sales_cycle_days != null && Number(imported.sales_cycle_days) >= 0
  );

  console.log(
    `Imported ${imported.note_count} note(s) → account_id=${imported.account_id}, sales_cycle_days=${imported.sales_cycle_days}, history_rows=${imported.historical_crm_context?.length ?? 0}`
  );

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nHubSpot live smoke passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
