/**
 * Focused HubSpot OAuth + deal-note import regression (no live HubSpot API).
 * Usage: npm run test:hubspot
 */
import { createSignedOAuthState, verifySignedOAuthState } from "../server/integrations/oauthShared.ts";
import { HUBSPOT_OAUTH_SCOPES, isHubSpotConfigured } from "../server/integrations/hubspot/config.ts";
import { buildHubSpotAuthorizeUrl } from "../server/integrations/hubspot/oauth.ts";
import { hubspotDealTestUtils } from "../server/integrations/hubspot/deals.ts";
import { mapHubSpotDealToDeepContext } from "../server/integrations/hubspot.ts";
import { MAX_SALES_CYCLE_DAYS } from "../server/deepContext.ts";

let failed = 0;

function check(label, condition) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    failed++;
  } else {
    console.log(`OK: ${label}`);
  }
}

const scopes = HUBSPOT_OAUTH_SCOPES.split(/\s+/).filter(Boolean);
check("scopes include oauth", scopes.includes("oauth"));
check("scopes include deals.read", scopes.includes("crm.objects.deals.read"));
check("no notes.read scope (not recognized on platform 2026.03)", !scopes.includes("crm.objects.notes.read"));
check("exactly two scopes", scopes.length === 2);
check(
  "no write scopes",
  !scopes.some((s) => /write|crm\.objects\.(contacts|companies)/i.test(s))
);

const secret = "hubspot-test-secret";
const state = createSignedOAuthState(secret);
check("signed oauth state verifies", verifySignedOAuthState(state, secret));
check("tampered state rejected", !verifySignedOAuthState(state.slice(0, -2) + "ab", secret));
check("wrong secret rejected", !verifySignedOAuthState(state, "other-secret"));

const prevId = process.env.HUBSPOT_CLIENT_ID;
const prevSecret = process.env.HUBSPOT_CLIENT_SECRET;
delete process.env.HUBSPOT_CLIENT_ID;
delete process.env.HUBSPOT_CLIENT_SECRET;
check("unconfigured when env missing", isHubSpotConfigured() === false);

process.env.HUBSPOT_CLIENT_ID = "test-client-id";
process.env.HUBSPOT_CLIENT_SECRET = "test-client-secret";
check("configured when env set", isHubSpotConfigured() === true);

const authUrl = buildHubSpotAuthorizeUrl(state);
check("authorize url hosts hubspot", authUrl.startsWith("https://app.hubspot.com/oauth/authorize"));
check("authorize url includes client_id", authUrl.includes("client_id=test-client-id"));
check("authorize url includes deals.read scope", authUrl.includes("crm.objects.deals.read"));
check("authorize url excludes notes.read scope", !authUrl.includes("crm.objects.notes.read"));
check("authorize url includes signed state", authUrl.includes(`state=${encodeURIComponent(state)}`) || authUrl.includes(state));

if (prevId === undefined) delete process.env.HUBSPOT_CLIENT_ID;
else process.env.HUBSPOT_CLIENT_ID = prevId;
if (prevSecret === undefined) delete process.env.HUBSPOT_CLIENT_SECRET;
else process.env.HUBSPOT_CLIENT_SECRET = prevSecret;

const created = new Date(Date.now() - 42 * 24 * 60 * 60 * 1000).toISOString();
check("days_in_pipeline from createdate", hubspotDealTestUtils.daysInPipelineFromCreate(created) === 42);
check("note date iso from ms", hubspotDealTestUtils.noteDateIso("2026-03-15T12:00:00.000Z") === "2026-03-15");

const snapshot = hubspotDealTestUtils.buildDealSnapshotFromApi(
  {
    id: "991122",
    properties: {
      dealname: "Northstar — Expansion",
      dealstage: "contractsent",
      createdate: created,
    },
  },
  [
    {
      id: "n1",
      body: "Champion wants SOC2 before Legal review",
      timestamp: "2026-02-01T10:00:00.000Z",
    },
    {
      id: "n2",
      body: "Budget cap raised to $85K",
      timestamp: "2026-04-10T15:30:00.000Z",
    },
  ]
);

check("snapshot deal_id", snapshot.deal_id === "991122");
check("snapshot dealname", snapshot.dealname === "Northstar — Expansion");
check("snapshot days_in_pipeline", snapshot.days_in_pipeline === 42);
check("snapshot timeline length", snapshot.timeline?.length === 2);

const mapped = mapHubSpotDealToDeepContext({ deal: snapshot });
check("mapper returns account_id", mapped?.account_id === "991122");
check("mapper sales_cycle_days", mapped?.sales_cycle_days === 42);
check("mapper historical entries", mapped?.historical_crm_context?.length === 2);
check(
  "mapper note body as objection",
  mapped?.historical_crm_context?.[0]?.past_logged_objections?.includes(
    "Champion wants SOC2 before Legal review"
  ) === true
);
check(
  "mapper caps sales cycle",
  mapHubSpotDealToDeepContext({
    deal: { deal_id: "1", dealname: "X", days_in_pipeline: 999 },
  })?.sales_cycle_days === MAX_SALES_CYCLE_DAYS
);

const emptyNotesMapped = mapHubSpotDealToDeepContext({
  deal: hubspotDealTestUtils.buildDealSnapshotFromApi(
    {
      id: "55",
      properties: { dealname: "Silent Deal", dealstage: "appointmentscheduled" },
    },
    []
  ),
});
check(
  "deal without notes still maps stage/name",
  (emptyNotesMapped?.historical_crm_context?.length ?? 0) >= 1
);

if (failed > 0) {
  console.error(`\nHubSpot regression FAILED (${failed})`);
  process.exit(1);
}

console.log("\nHUBSPOT OAUTH / DEAL-NOTE IMPORT REGRESSION OK");
