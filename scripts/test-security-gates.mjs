/**
 * Security gate regressions (no live network).
 * Usage: npm run test:security
 */
import { verifyHubSpotWebhookSecret } from "../server/integrations/hubspot.ts";
import { createSignedOAuthState, verifySignedOAuthState } from "../server/integrations/oauthShared.ts";
import { secretsEqual } from "../server/cryptoSecrets.ts";
import { consumeRateLimit } from "../server/rateLimit.ts";
import { consumeLoginCode, issueLoginCode } from "../server/loginTickets.ts";
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
check("login code cannot be reused", consumeLoginCode(code) === null);
check("login code rejects missing id", consumeLoginCode("") === null);

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

if (failed) {
  console.error(`${failed} security gate(s) failed`);
  process.exit(1);
}
console.log("All security gates passed");
