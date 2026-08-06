/**
 * Simulated live HubSpot smoke using HubSpot CLI Local Dev access token
 * (~/.hscli/config.yml) — does not require Connect HubSpot in the browser.
 *
 * Exercises: deal search → note associations → note batch read → Lazarus mapper.
 * Does not exercise the OAuth popup / token store path.
 *
 * Usage: node --use-system-ca --import tsx scripts/test-hubspot-cli-smoke.mjs [query]
 */
import fs from "fs";
import path from "path";
import os from "os";
import { mapHubSpotDealToDeepContext } from "../server/integrations/hubspot.ts";
import { hubspotDealTestUtils } from "../server/integrations/hubspot/deals.ts";

const query = process.argv.slice(2).join(" ").trim() || "a";
const CRM = "https://api.hubapi.com/crm/v3";

let failed = 0;
function check(label, condition) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    failed++;
  } else {
    console.log(`OK: ${label}`);
  }
}

function loadCliAccessToken() {
  const configPath = path.join(os.homedir(), ".hscli", "config.yml");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing ${configPath} — run hs account auth first`);
  }
  const lines = fs.readFileSync(configPath, "utf8").split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\s*accessToken:\s*/.test(line)) continue;

    const inline = line.replace(/^\s*accessToken:\s*/, "").trim().replace(/^['"]|['"]$/g, "");
    // Ignore YAML block indicators (|, >, etc.)
    if (inline && inline.length > 20 && !/^[|>]/.test(inline)) return inline;

    // Value on following indented line(s)
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (!next.trim()) continue;
      if (/^\s{0,8}\S/.test(next) && !/^\s{10,}/.test(next)) break;
      const candidate = next.trim().replace(/^['"]|['"]$/g, "");
      if (candidate.length > 20 && !/^(expiresAt|tokenInfo|auth|account)/.test(candidate)) {
        return candidate;
      }
      break;
    }
  }
  throw new Error("No accessToken found in ~/.hscli/config.yml");
}

async function hubFetch(token, apiPath, init) {
  const res = await fetch(`${CRM}${apiPath}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function main() {
  console.log("Mode: CLI-token simulation (not OAuth Connect popup)");
  console.log(`Deal search query: ${JSON.stringify(query)}`);

  const token = loadCliAccessToken();
  check("CLI access token loaded", token.length > 20);

  const searchBody = {
    filterGroups: [
      {
        filters: [
          {
            propertyName: "dealname",
            operator: "CONTAINS_TOKEN",
            value: query,
          },
        ],
      },
    ],
    properties: ["dealname", "dealstage", "amount", "closedate", "createdate"],
    limit: 5,
    sorts: [{ propertyName: "hs_lastmodifieddate", direction: "DESCENDING" }],
  };

  let { res, data } = await hubFetch(token, "/objects/deals/search", {
    method: "POST",
    body: JSON.stringify(searchBody),
  });

  // Broaden if tokenized search fails or returns empty (short queries).
  if (!res.ok || !(data.results ?? []).length) {
    ({ res, data } = await hubFetch(
      token,
      "/objects/deals?limit=5&properties=dealname,dealstage,amount,closedate,createdate"
    ));
  }

  check(`HubSpot deals reachable (${res.status})`, res.ok);
  if (!res.ok) {
    console.error("HubSpot error:", data.message ?? data);
    console.error(
      "Likely missing CRM scopes on the personal access key. Regenerate PAK with CRM deals/notes read."
    );
    process.exit(1);
  }

  const deals = data.results ?? [];
  check("at least one deal returned", deals.length > 0);
  if (!deals.length) {
    console.error("No deals in this HubSpot account to smoke against.");
    process.exit(1);
  }

  const deal = deals[0];
  const dealname = deal.properties?.dealname ?? `(deal ${deal.id})`;
  console.log(`Using deal: ${dealname} (${deal.id})`);

  ({ res, data } = await hubFetch(token, `/objects/deals/${deal.id}/associations/notes`));
  check(`note associations reachable (${res.status})`, res.ok);
  const noteIds = (data.results ?? [])
    .map((r) => String(r.id ?? r.toObjectId ?? "").trim())
    .filter(Boolean);
  console.log(`Associated notes: ${noteIds.length}`);

  let notes = [];
  if (noteIds.length) {
    ({ res, data } = await hubFetch(token, "/objects/notes/batch/read", {
      method: "POST",
      body: JSON.stringify({
        properties: ["hs_note_body", "hs_timestamp", "hs_createdate"],
        inputs: noteIds.slice(0, 20).map((id) => ({ id })),
      }),
    }));
    check(`notes batch read (${res.status})`, res.ok);
    notes = (data.results ?? [])
      .map((n) => ({
        id: String(n.id),
        body: String(n.properties?.hs_note_body ?? "").trim(),
        timestamp: String(n.properties?.hs_timestamp ?? n.properties?.hs_createdate ?? ""),
      }))
      .filter((n) => n.body);
  } else {
    check("no notes on deal — import path still maps deal fields", true);
  }

  const snapshot = hubspotDealTestUtils.buildDealSnapshotFromApi(deal, notes);
  const mapped = mapHubSpotDealToDeepContext({ deal: snapshot });
  check("Lazarus mapper returns deep context", Boolean(mapped));
  check("mapped account_id", Boolean(mapped?.account_id));
  check("mapped sales_cycle_days", mapped?.sales_cycle_days != null);
  check(
    "historical_crm_context is array",
    Array.isArray(mapped?.historical_crm_context)
  );

  console.log(
    `Mapped: account_id=${mapped?.account_id}, sales_cycle_days=${mapped?.sales_cycle_days}, history_rows=${mapped?.historical_crm_context?.length ?? 0}, notes_with_body=${notes.length}`
  );

  if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nHubSpot CLI-token simulation smoke passed.");
  console.log(
    "Note: OAuth Connect popup still needs one human authorize for production UI tokens."
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
