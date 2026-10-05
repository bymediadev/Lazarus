/**
 * Security gate regressions (no live network).
 * Usage: npm run test:security
 */
import { verifyHubSpotWebhookSecret } from "../server/integrations/hubspot.ts";
import { createSignedOAuthState, verifySignedOAuthState, readSignedOAuthState, oauthFrontendReturnUrl } from "../server/integrations/oauthShared.ts";
import { secretsEqual } from "../server/cryptoSecrets.ts";
import { consumeRateLimit } from "../server/rateLimit.ts";
import { consumeLoginCode, issueLoginCode } from "../server/loginTickets.ts";
import {
  createSalesforcePkce,
  openSalesforcePkceCookie,
  sealSalesforcePkceCookie,
} from "../server/integrations/salesforce/pkce.ts";
import { buildSalesforceAuthorizeUrl } from "../server/integrations/salesforce/oauth.ts";
import { createHash } from "crypto";
import {
  isAnonymousGuestRateLimited,
  consumeAnonymousGuestSlot,
  isIpDailyRateLimited,
  consumeIpMonthlySlot,
  isPpuIpRateLimited,
  consumePpuIpSlot,
  resetGuestRateLimitBuckets,
} from "../server/guestRateLimit.ts";
import { requireEmailDelivery } from "../server/authRoutes.ts";
import {
  captchaRequired,
  captchaTokenFromRequest,
  enforceCaptcha,
  verifyTurnstileToken,
} from "../server/captcha.ts";
import {
  bindZoomRtmsToSession,
  createZoomLiveSession,
  publishToZoomRtms,
  subscribeLiveSession,
} from "../server/integrations/zoom/transcriptBus.ts";
import {
  analyzeWorkspaceDecision,
  dealListAllowed,
  filterRowsForTenant,
  scrubWorkspaceHealthRow,
  tenantStampForWrite,
  workspaceNameFromEmail,
} from "../server/tenantScope.ts";
import {
  containsEvidence,
  crmLinkWriteFields,
  NARRATIVE_FIELDS,
  purgeAfterForRescueOutcome,
  purgeAfterForStatus,
  retentionPurgePlan,
  storedAnalysisJson,
  storedReportColumns,
  tenantForReportWrite,
} from "../server/reportSanitize.ts";
import {
  createTenantApiKey,
  decideApiKey,
  hashTenantApiKey,
  issuedKeyRecord,
  tenantForKeyIssue,
} from "../server/tenantApiKey.ts";

let failed = 0;

function check(label, condition) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    failed += 1;
  } else {
    console.log(`OK: ${label}`);
  }
}

check("hubspot webhook fail-closed when secret missing", verifyHubSpotWebhookSecret("anything", "") === false);
check("hubspot webhook reject wrong secret", verifyHubSpotWebhookSecret("nope", "expected") === false);
check("hubspot webhook accept matching secret", verifyHubSpotWebhookSecret("expected", "expected") === true);

check("secretsEqual rejects empty", secretsEqual("", "abc") === false);
check("secretsEqual matches", secretsEqual("same", "same") === true);
check("secretsEqual mismatch", secretsEqual("a", "b") === false);

const prevState = process.env.OAUTH_STATE_SECRET;
delete process.env.OAUTH_STATE_SECRET;
const state = createSignedOAuthState("provider-secret");
check("oauth state verifies with provider secret (no hardcoded fallback)", verifySignedOAuthState(state, "provider-secret"));
check("oauth state rejects other secret", !verifySignedOAuthState(state, "other"));
try {
  createSignedOAuthState("");
  check("oauth state throws when no secret at all", false);
} catch {
  check("oauth state throws when no secret at all", true);
}
if (prevState === undefined) delete process.env.OAUTH_STATE_SECRET;
else process.env.OAUTH_STATE_SECRET = prevState;

const code = issueLoginCode({
  userId: "user-1",
  email: "rep@example.com",
  provider: "google",
  access_token: "access",
  refresh_token: "refresh",
  expires_at: new Date().toISOString(),
});
const first = consumeLoginCode(code);
check("login code consumes once and is user-bound", first?.userId === "user-1" && first.access_token === "access");
check("login code can be replayed briefly for popup+opener", consumeLoginCode(code)?.userId === "user-1");
check("login code rejects missing id", consumeLoginCode("") === null);

const loginState = createSignedOAuthState("provider-secret", {
  purpose: "login",
  returnOrigin: "https://www.getldr.ca",
  returnPath: "/login",
});
const loginParsed = readSignedOAuthState(loginState, "provider-secret");
check(
  "oauth 7-part state roundtrip",
  loginParsed.ok === true &&
    loginParsed.purpose === "login" &&
    loginParsed.returnOrigin === "https://www.getldr.ca" &&
    loginParsed.returnPath === "/login"
);
check(
  "oauth login callback returns to /login",
  oauthFrontendReturnUrl(loginParsed, { google: "connected", login_code: "abc" }) ===
    "https://www.getldr.ca/login?google=connected&login_code=abc"
);
const connectState = createSignedOAuthState("provider-secret", {
  userId: "user-1",
  purpose: "connect",
  returnOrigin: "https://www.getldr.ca",
  returnPath: "/portal",
});
check(
  "oauth connect callback returns to /portal",
  oauthFrontendReturnUrl(readSignedOAuthState(connectState, "provider-secret"), { google: "connected" }) ===
    "https://www.getldr.ca/portal?google=connected"
);

const sfPkce = createSalesforcePkce();
check("salesforce pkce verifier is 43 chars", sfPkce.verifier.length === 43);
check(
  "salesforce pkce challenge is S256",
  createHash("sha256").update(sfPkce.verifier).digest("base64url") === sfPkce.challenge
);
const sfSealed = sealSalesforcePkceCookie("provider-secret", "state-abc", sfPkce.verifier);
check(
  "salesforce pkce cookie opens for matching state",
  openSalesforcePkceCookie("provider-secret", "state-abc", sfSealed) === sfPkce.verifier
);
check(
  "salesforce pkce cookie rejects other state",
  openSalesforcePkceCookie("provider-secret", "other-state", sfSealed) === undefined
);
check(
  "salesforce pkce cookie rejects other secret",
  openSalesforcePkceCookie("other-secret", "state-abc", sfSealed) === undefined
);

const prevSfId = process.env.SALESFORCE_CLIENT_ID;
const prevSfSecret = process.env.SALESFORCE_CLIENT_SECRET;
const prevSfRedirect = process.env.SALESFORCE_REDIRECT_URI;
process.env.SALESFORCE_CLIENT_ID = "test-client-id";
process.env.SALESFORCE_CLIENT_SECRET = "test-client-secret";
process.env.SALESFORCE_REDIRECT_URI = "https://api.getldr.ca/api/integrations/salesforce/callback";
const sfAuth = new URL(buildSalesforceAuthorizeUrl("st", "login", { codeChallenge: "challenge-abc" }));
check("salesforce authorize includes code_challenge", sfAuth.searchParams.get("code_challenge") === "challenge-abc");
check("salesforce authorize uses S256", sfAuth.searchParams.get("code_challenge_method") === "S256");
if (prevSfId === undefined) delete process.env.SALESFORCE_CLIENT_ID;
else process.env.SALESFORCE_CLIENT_ID = prevSfId;
if (prevSfSecret === undefined) delete process.env.SALESFORCE_CLIENT_SECRET;
else process.env.SALESFORCE_CLIENT_SECRET = prevSfSecret;
if (prevSfRedirect === undefined) delete process.env.SALESFORCE_REDIRECT_URI;
else process.env.SALESFORCE_REDIRECT_URI = prevSfRedirect;

const prevDelivery = process.env.AUTH_REQUIRE_EMAIL_DELIVERY;
const prevNode = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
delete process.env.AUTH_REQUIRE_EMAIL_DELIVERY;
check("AUTH_REQUIRE_EMAIL_DELIVERY defaults true in production", requireEmailDelivery() === true);
process.env.AUTH_REQUIRE_EMAIL_DELIVERY = "false";
check("AUTH_REQUIRE_EMAIL_DELIVERY can be opted out", requireEmailDelivery() === false);
if (prevDelivery === undefined) delete process.env.AUTH_REQUIRE_EMAIL_DELIVERY;
else process.env.AUTH_REQUIRE_EMAIL_DELIVERY = prevDelivery;
if (prevNode === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = prevNode;

const ownerA = createZoomLiveSession("user-a");
const ownerB = createZoomLiveSession("user-b");
check(
  "zoom RTMS binds meeting to one owner session",
  bindZoomRtmsToSession("user-a", "meet-a", "stream-a") === ownerA.sessionId
);
check(
  "zoom RTMS binds other meeting to other owner",
  bindZoomRtmsToSession("user-b", "meet-b", "stream-b") === ownerB.sessionId
);
let gotA = 0;
let gotB = 0;
subscribeLiveSession(ownerA.sessionId, () => {
  gotA += 1;
});
subscribeLiveSession(ownerB.sessionId, () => {
  gotB += 1;
});
const chunk = {
  speaker: "Alex",
  dialogue: "only for meeting A",
  timestamp: "00:01",
  source: "zoom_rtms",
};
check("zoom RTMS publish hits bound session", publishToZoomRtms("stream-a", "meet-a", chunk) === true);
check("zoom RTMS does not fan-out to the other session", gotA === 1 && gotB === 0);
check("zoom RTMS unknown stream is dropped", publishToZoomRtms("stream-none", "meet-none", chunk) === false);

const key = `test:${Date.now()}`;
check("rate limit allows first", consumeRateLimit(key, 60_000, 2) === false);
check("rate limit allows second", consumeRateLimit(key, 60_000, 2) === false);
check("rate limit blocks third", consumeRateLimit(key, 60_000, 2) === true);

const prevCaptcha = process.env.CAPTCHA_REQUIRED;
const prevCaptchaSecret = process.env.TURNSTILE_SECRET_KEY;
const prevCaptchaNode = process.env.NODE_ENV;
process.env.NODE_ENV = "production";
delete process.env.CAPTCHA_REQUIRED;
delete process.env.TURNSTILE_SECRET_KEY;
check("CAPTCHA_REQUIRED defaults true in production", captchaRequired() === true);
process.env.CAPTCHA_REQUIRED = "false";
check("CAPTCHA_REQUIRED can be opted out", captchaRequired() === false);
process.env.NODE_ENV = "development";
delete process.env.CAPTCHA_REQUIRED;
delete process.env.TURNSTILE_SECRET_KEY;
check("captcha skipped locally without secret", captchaRequired() === false);
process.env.TURNSTILE_SECRET_KEY = "test-secret";
check("captcha required locally when secret is set", captchaRequired() === true);

check(
  "captcha token from header",
  captchaTokenFromRequest({ headers: { "x-captcha-token": " header-token " }, body: {} }) === "header-token"
);
check(
  "captcha token from multipart body",
  captchaTokenFromRequest({ headers: {}, body: { captcha_token: " body-token " } }) === "body-token"
);
check("captcha token missing is empty", captchaTokenFromRequest({ headers: {}, body: {} }) === "");

process.env.TURNSTILE_SECRET_KEY = "unit-secret";
check("verifyTurnstileToken rejects empty token", (await verifyTurnstileToken("")) === false);
const mockOk = async () => ({ json: async () => ({ success: true }) });
const mockFail = async () => ({ json: async () => ({ success: false }) });
check(
  "verifyTurnstileToken accepts Cloudflare success",
  (await verifyTurnstileToken("tok", "127.0.0.1", mockOk)) === true
);
check(
  "verifyTurnstileToken rejects Cloudflare failure",
  (await verifyTurnstileToken("tok", "127.0.0.1", mockFail)) === false
);
const missingToken = await enforceCaptcha({
  headers: {},
  body: {},
  socket: { remoteAddress: "127.0.0.1" },
});
check(
  "enforceCaptcha rejects missing token when required",
  missingToken.ok === false && missingToken.code === "CAPTCHA_REQUIRED"
);
process.env.CAPTCHA_REQUIRED = "false";
const skipped = await enforceCaptcha({ headers: {}, body: {}, socket: { remoteAddress: "127.0.0.1" } });
check("enforceCaptcha allows skip when opted out", skipped.ok === true);
if (prevCaptcha === undefined) delete process.env.CAPTCHA_REQUIRED;
else process.env.CAPTCHA_REQUIRED = prevCaptcha;
if (prevCaptchaSecret === undefined) delete process.env.TURNSTILE_SECRET_KEY;
else process.env.TURNSTILE_SECRET_KEY = prevCaptchaSecret;
if (prevCaptchaNode === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = prevCaptchaNode;

const prevIpLimit = process.env.GUEST_IP_MONTHLY_LIMIT;
const prevFreePerIp = process.env.GUEST_FREE_PER_IP;
process.env.GUEST_FREE_PER_IP = "5";
process.env.GUEST_IP_MONTHLY_LIMIT = "100";
process.env.GUEST_LIMIT_MEMORY_ONLY = "true";
resetGuestRateLimitBuckets();
const guestReq = (ip) => ({
  headers: { "x-forwarded-for": ip, "user-agent": "test" },
  socket: { remoteAddress: ip },
});
let guestHits = 0;
for (let i = 0; i < 5; i++) {
  if (await isAnonymousGuestRateLimited(guestReq("203.0.113.9"))) break;
  if (!(await consumeAnonymousGuestSlot(guestReq("203.0.113.9")))) guestHits += 1;
}
check("guest free cap allows 5 per IP per calendar month", guestHits === 5);
check(
  "guest free cap blocks the 6th from the same IP",
  (await isAnonymousGuestRateLimited(guestReq("203.0.113.9"))) === true
);
check(
  "guest free peek does not burn a slot",
  (await isAnonymousGuestRateLimited(guestReq("203.0.113.9"))) === true
);
check(
  "guest free cap is per IP, not shared",
  (await isAnonymousGuestRateLimited(guestReq("203.0.113.10"))) === false
);
resetGuestRateLimitBuckets();
process.env.GUEST_IP_MONTHLY_LIMIT = "3";
let ipHits = 0;
for (let i = 0; i < 3; i++) {
  if (await isIpDailyRateLimited(guestReq("198.51.100.7"))) break;
  if (!(await consumeIpMonthlySlot(guestReq("198.51.100.7")))) ipHits += 1;
}
check("IP monthly ceiling allows configured max", ipHits === 3);
check("IP monthly ceiling blocks the next request", (await isIpDailyRateLimited(guestReq("198.51.100.7"))) === true);
resetGuestRateLimitBuckets();
process.env.PPU_IP_MONTHLY_LIMIT = "2";
let ppuHits = 0;
for (let i = 0; i < 2; i++) {
  if (await isPpuIpRateLimited(guestReq("198.51.100.9"))) break;
  if (!(await consumePpuIpSlot(guestReq("198.51.100.9")))) ppuHits += 1;
}
check("PPU IP ceiling allows configured max", ppuHits === 2);
check("PPU IP ceiling blocks the next request", (await isPpuIpRateLimited(guestReq("198.51.100.9"))) === true);
check(
  "PPU IP ceiling is per IP, not shared with unpaid bucket",
  (await isPpuIpRateLimited(guestReq("198.51.100.10"))) === false
);
delete process.env.PPU_IP_MONTHLY_LIMIT;
if (prevIpLimit === undefined) delete process.env.GUEST_IP_MONTHLY_LIMIT;
else process.env.GUEST_IP_MONTHLY_LIMIT = prevIpLimit;
if (prevFreePerIp === undefined) delete process.env.GUEST_FREE_PER_IP;
else process.env.GUEST_FREE_PER_IP = prevFreePerIp;
delete process.env.GUEST_LIMIT_MEMORY_ONLY;
resetGuestRateLimitBuckets();

const companyA = "tenant-a";
const companyB = "tenant-b";
const deals = [
  { id: "deal-a", tenant_id: companyA, transcript_text: "secret-a" },
  { id: "deal-b", tenant_id: companyB, transcript_text: "secret-b" },
];
const visibleToA = filterRowsForTenant(deals, companyA);
check(
  "company A cannot read company B deals",
  visibleToA.length === 1 && visibleToA[0].id === "deal-a" && !visibleToA.some((row) => row.tenant_id === companyB)
);
check("deal list rejects a session with no membership", dealListAllowed(null) === false);
check(
  "body tenant_id does not change the write stamp",
  tenantStampForWrite(companyA, { tenant_id: companyB }) === companyA
);
check(
  "missing membership stamps null even if the body names a tenant",
  tenantStampForWrite(null, { tenant_id: companyB }) === null
);
const guest = analyzeWorkspaceDecision(null, null, { tenant_id: companyB });
check(
  "guest analyze with no membership passes the workspace gate",
  guest.proceed === true && guest.tenantId === null
);
const member = analyzeWorkspaceDecision("user-1", companyA, { tenant_id: companyB });
check("signed-in member stamps their company and ignores body tenant_id", member.proceed === true && member.tenantId === companyA);
check("workspace name uses the email local-part", workspaceNameFromEmail("ada@example.com") === "ada Workspace");
check("workspace name falls back when email is missing", workspaceNameFromEmail(null) === "Workspace");
const health = scrubWorkspaceHealthRow({
  tenant_id: companyA,
  company_name: "Ada Workspace",
  integrations: {
    google: "connected",
    hubspot: "expired",
    salesforce: "not_connected",
    zoom: "not_connected",
    teams: "connected",
  },
  transcript_text: "do not leak",
  analysis_json: { secret: true },
  access_token: "token",
});
check(
  "founder workspace payload omits transcripts and tokens",
  health.transcript_text === undefined &&
    health.analysis_json === undefined &&
    health.access_token === undefined &&
    health.integrations.hubspot === "expired"
);

const fullBrief = {
  proprietary_indices: { deal_risk_index: 70 },
  deal_classification: { status: "STALLED — RECOVERABLE" },
  rescue_triage_plan: { immediate_0_30_days: ["Deliver the pilot proposal"] },
  viability_state: { viability_score: 40 },
  causal_forces: [{ factor: "Budget", evidence: "We cannot fund this until Q3" }],
  historical_crm_context: [{ note: "Buyer said no on the last call" }],
  transcript: "raw call text",
};
const stored = storedAnalysisJson(JSON.stringify(fullBrief));
check(
  "stored report drops evidence quotes and CRM text",
  stored &&
    containsEvidence(stored) === false &&
    stored.proprietary_indices.deal_risk_index === 70 &&
    stored.rescue_triage_plan.immediate_0_30_days[0] === "Deliver the pilot proposal"
);
check("caller brief still contains the evidence", containsEvidence(fullBrief) === true);
check(
  "company key stamps company A and ignores a body tenant id",
  tenantForReportWrite({
    userId: null,
    tenantIdFromKey: companyA,
    body: { tenant_id: companyB },
  }) === companyA
);
check(
  "signed-in membership wins over a company key",
  tenantForReportWrite({
    userId: "user-1",
    membershipTenantId: companyA,
    tenantIdFromKey: companyB,
    body: { tenant_id: companyB },
  }) === companyA
);
check(
  "site key reaches analyze without a company stamp",
  decideApiKey({ header: "site-secret", siteKey: "site-secret", tenantIdForHeader: null }).ok === true &&
    decideApiKey({ header: "site-secret", siteKey: "site-secret", tenantIdForHeader: null }).tenantId === null
);
check(
  "company key attaches that tenant",
  decideApiKey({ header: "ldr_company", siteKey: "site-secret", tenantIdForHeader: companyA }).tenantId === companyA
);
check(
  "unknown key is rejected when a site key is configured",
  decideApiKey({ header: "nope", siteKey: "site-secret", tenantIdForHeader: null }).ok === false
);
check(
  "missing key still reaches analyze when no site key is configured",
  decideApiKey({ header: "", siteKey: "", tenantIdForHeader: null }).ok === true
);
check(
  "company key issue uses the signed-in company and drops a body tenant id",
  tenantForKeyIssue(companyA, { tenant_id: companyB, api_key_hash: "injected-hash" }) === companyA
);
check(
  "company key issue without a membership stays empty when the body names a tenant",
  tenantForKeyIssue(null, { tenant_id: companyB, api_key_hash: "injected-hash" }) === null
);
const minted = createTenantApiKey();
check(
  "minted company key starts with lz and is not the stored hash",
  minted.raw.startsWith("lz_") &&
    minted.prefix.startsWith("lz_") &&
    minted.raw.startsWith(minted.prefix) &&
    minted.hash.length === 64 &&
    minted.hash !== minted.raw &&
    hashTenantApiKey(minted.raw) === minted.hash
);
const storedKey = issuedKeyRecord(minted, { api_key_hash: "injected-hash", tenant_id: companyB });
check(
  "saved key row keeps the minted hash and drops an injected hash",
  storedKey.api_key_hash === minted.hash && storedKey.api_key_prefix === minted.prefix
);

const purgeNow = new Date("2026-06-01T15:00:00.000Z");
const openStatuses = [
  "ACTIVE",
  "STALLED — RECOVERABLE",
  "STALLED — UNCERTAIN",
  "STALLED — HIGH RISK",
  "CLOSED LOST — RECOVERABLE",
];
for (const status of openStatuses) {
  check(`open status ${status} clears purge_after`, purgeAfterForStatus(status, purgeNow) === null);
}
for (const status of ["CLOSED WON", "CLOSED LOST — UNLIKELY"]) {
  const purgeAt = purgeAfterForStatus(status, purgeNow);
  const daysOut = purgeAt ? (new Date(purgeAt).getTime() - purgeNow.getTime()) / 86_400_000 : 0;
  check(
    `finished status ${status} sets purge_after about 30 days out`,
    daysOut > 29 && daysOut < 31
  );
}
check(
  "a later open status does not keep a closed purge date",
  purgeAfterForStatus("CLOSED WON", purgeNow) !== null &&
    purgeAfterForStatus("STALLED — RECOVERABLE", purgeNow) === null
);

const closedClock = purgeAfterForStatus("CLOSED WON", purgeNow);
const reopenedClock = purgeAfterForStatus("ACTIVE", purgeNow);
check(
  "transitioning an active status removes the purge_after assignment",
  closedClock !== null && reopenedClock === null
);
for (const outcome of ["still_stalled", "unknown"]) {
  check(
    `rescue outcome ${outcome} clears purge_after`,
    purgeAfterForRescueOutcome(outcome, purgeNow) === null
  );
}
for (const outcome of ["closed_won", "lost"]) {
  const at = purgeAfterForRescueOutcome(outcome, purgeNow);
  const daysOut = at ? (new Date(at).getTime() - purgeNow.getTime()) / 86_400_000 : 0;
  check(`rescue outcome ${outcome} sets purge_after about 30 days out`, daysOut > 29 && daysOut < 31);
}

const injectedBody = {
  transcript_text: "raw call that must not be stored",
  purge_after: "2000-01-01T00:00:00.000Z",
  tenant_id: companyB,
  quotes: ["Buyer said the budget is frozen"],
  historical_crm_context: [{ note: "CRM note that must not stick" }],
};
const written = storedReportColumns({
  dealStatus: "STALLED — RECOVERABLE",
  analysisJson: fullBrief,
  dealMemorySummary: {
    deal_risk_index: 70,
    deal_status: "STALLED — RECOVERABLE",
    rescue_triage_plan: { immediate_0_30_days: ["Deliver the pilot proposal"] },
    historical_crm_context: [{ note: "past CRM block" }],
    evidence: "We cannot fund this until Q3",
  },
  injected: injectedBody,
  now: purgeNow,
});
check(
  "body injections are discarded on the stored report",
  written.transcript_text === null &&
    written.purge_after === null &&
    written.purge_after !== injectedBody.purge_after &&
    containsEvidence(written.analysis_json) === false &&
    containsEvidence(written.deal_memory_summary) === false &&
    written.analysis_json.proprietary_indices.deal_risk_index === 70 &&
    written.deal_memory_summary.deal_status === "STALLED — RECOVERABLE" &&
    written.deal_memory_summary.rescue_triage_plan.immediate_0_30_days[0] ===
      "Deliver the pilot proposal"
);
const finishedWrite = storedReportColumns({
  dealStatus: "CLOSED LOST — UNLIKELY",
  analysisJson: fullBrief,
  injected: injectedBody,
  now: purgeNow,
});
const finishedDays = finishedWrite.purge_after
  ? (new Date(finishedWrite.purge_after).getTime() - purgeNow.getTime()) / 86_400_000
  : 0;
check(
  "a finished status ignores an injected purge date and sets 30 days",
  finishedDays > 29 && finishedDays < 31 && finishedWrite.transcript_text === null
);

const crmStored = crmLinkWriteFields({
  provider: "hubspot",
  external_deal_id: "deal-1",
  sales_cycle_days: 180,
  historical_crm_context: [{ note: "do not store" }],
  transcript_text: "do not store",
  quotes: ["no"],
});
check(
  "CRM link writes drop note text and quotes",
  crmStored.provider === "hubspot" &&
    crmStored.external_deal_id === "deal-1" &&
    crmStored.sales_cycle_days === 180 &&
    crmStored.historical_crm_context === null &&
    crmStored.transcript_text === undefined &&
    crmStored.quotes === undefined
);

const deadline = new Date("2026-07-02T00:00:00.000Z");
const expiredReport = {
  id: "report-expired",
  purge_after: "2026-07-01T00:00:00.000Z",
  transcript_text: "full dialogue that must disappear",
  why_it_stalled: "Buyer narrative that must disappear",
  restart_plan: "Rescue narrative that must disappear",
  stall_cause: "Headline narrative",
  analysis_json: { quote: "raw quote", proprietary_indices: { deal_risk_index: 80 } },
  deal_memory_summary: { historical_crm_context: [{ note: "crm" }] },
};
const openReport = {
  id: "report-open",
  purge_after: null,
  transcript_text: null,
  why_it_stalled: "Still in the pipeline",
  analysis_json: { proprietary_indices: { deal_risk_index: 40 } },
};
const futureReport = {
  id: "report-future",
  purge_after: "2026-08-01T00:00:00.000Z",
  transcript_text: null,
  why_it_stalled: "Won, still inside the window",
};
const rescueOutcomes = [{ id: "outcome-1", post_mortem_id: "report-expired", outcome: "lost" }];
const plan = retentionPurgePlan(
  [expiredReport, openReport, futureReport],
  [
    { id: "link-expired", post_mortem_id: "report-expired" },
    { id: "link-open", post_mortem_id: "report-open" },
    { id: "link-unattached", post_mortem_id: null },
  ],
  deadline
);
const remainingIds = new Set(plan.remaining.map((row) => row.id));
const narrativeLeft = plan.remaining.flatMap((row) =>
  NARRATIVE_FIELDS.map((field) => row[field]).filter((value) => value != null && value !== "")
);
check(
  "expired reports and their CRM links are deleted together",
  plan.reportIds.length === 1 &&
    plan.reportIds[0] === "report-expired" &&
    plan.linkIds.length === 1 &&
    plan.linkIds[0] === "link-expired"
);
check(
  "open and not-yet-due reports stay",
  remainingIds.has("report-open") && remainingIds.has("report-future") && !remainingIds.has("report-expired")
);
check(
  "narrative properties on an expired report are gone with the row",
  !narrativeLeft.includes(expiredReport.transcript_text) &&
    !narrativeLeft.includes(expiredReport.why_it_stalled) &&
    !narrativeLeft.includes(expiredReport.restart_plan) &&
    !plan.remaining.some((row) => row.analysis_json?.quote)
);
check(
  "anonymized rescue outcomes are outside the report delete set",
  rescueOutcomes.length === 1 && !plan.reportIds.includes(rescueOutcomes[0].id)
);

if (failed) {
  console.error(`${failed} security gate(s) failed`);
  process.exit(1);
}
console.log("All security gates passed");
