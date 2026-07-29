/** Shared HMAC-signed OAuth state (survives Render free-tier restarts). */

import crypto from "crypto";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function stateSecret(fallback: string): string {
  return (
    (process.env.OAUTH_STATE_SECRET ?? "").trim() ||
    fallback ||
    "lazarus-oauth-dev-only"
  );
}

export function createSignedOAuthState(secretFallback: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const exp = String(Date.now() + OAUTH_STATE_TTL_MS);
  const payload = `${nonce}.${exp}`;
  const sig = crypto.createHmac("sha256", stateSecret(secretFallback)).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySignedOAuthState(
  state: string | undefined,
  secretFallback: string
): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [nonce, exp, sig] = parts;
  if (!nonce || !exp || !sig) return false;

  const payload = `${nonce}.${exp}`;
  const expected = crypto
    .createHmac("sha256", stateSecret(secretFallback))
    .update(payload)
    .digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }

  const expiry = Number(exp);
  return Number.isFinite(expiry) && Date.now() <= expiry;
}

export function resolveFrontendOrigin(): string {
  const fromEnv = (process.env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  // Local OAuth popups must land on localhost so postMessage can reach the opener tab.
  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const local = fromEnv.find((o) => /localhost|127\.0\.0\.1/i.test(o));
    if (local) return local.replace(/\/$/, "");
  }

  const httpsPublic = fromEnv.find(
    (o) => o.startsWith("https://") && !/localhost|127\.0\.0\.1/i.test(o)
  );
  if (httpsPublic) return httpsPublic.replace(/\/$/, "");

  // Production monolith: PUBLIC_API_URL is often the same origin as the UI.
  const publicApi = (process.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (isProd && publicApi.startsWith("https://")) return publicApi;

  if (isProd) {
    return "https://lazarus-4uxi.onrender.com";
  }

  const anyNonLocal = fromEnv.find((o) => !/localhost|127\.0\.0\.1/i.test(o));
  if (anyNonLocal) return anyNonLocal.replace(/\/$/, "");

  return (fromEnv[0] ?? "http://localhost:5173").replace(/\/$/, "");
}

export function publicApiBase(): string {
  const explicit = (process.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const port = process.env.PORT ?? "3001";
  return `http://localhost:${port}`;
}
