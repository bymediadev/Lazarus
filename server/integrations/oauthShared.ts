/** Shared HMAC-signed OAuth state (survives Render free-tier restarts). */

import crypto from "crypto";

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

/** Public marketing + app origin (GitHub Pages). API stays on Render. */
export const CANONICAL_SITE_ORIGIN = "https://www.getldr.ca";
export const CANONICAL_SITE_ORIGINS = [
  "https://www.getldr.ca",
  "https://getldr.ca",
] as const;

const LOCAL_DEV_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3001",
  "http://127.0.0.1:5173",
] as const;

function stripSlash(origin: string): string {
  return origin.replace(/\/$/, "");
}

export function listedFrontendOrigins(): string[] {
  return (process.env.FRONTEND_ORIGIN ?? "")
    .split(",")
    .map((o) => stripSlash(o.trim()))
    .filter(Boolean);
}

/** Browser origins allowed to call the Render API (GitHub Pages + local + env). */
export function corsAllowedOrigins(): string[] {
  return [
    ...new Set([
      ...listedFrontendOrigins(),
      ...CANONICAL_SITE_ORIGINS,
      ...LOCAL_DEV_ORIGINS,
      "https://bymediadev.github.io",
    ]),
  ];
}

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
  const fromEnv = listedFrontendOrigins();
  const isProd = process.env.NODE_ENV === "production";

  // Local OAuth popups must land on localhost so postMessage can reach the opener tab.
  if (!isProd) {
    const local = fromEnv.find((o) => /localhost|127\.0\.0\.1/i.test(o));
    if (local) return local;
    return "http://localhost:5173";
  }

  const listedCanonical = fromEnv.find((o) =>
    (CANONICAL_SITE_ORIGINS as readonly string[]).includes(o)
  );
  if (listedCanonical) {
    return listedCanonical === "https://getldr.ca" ? CANONICAL_SITE_ORIGIN : listedCanonical;
  }

  return CANONICAL_SITE_ORIGIN;
}

export function publicApiBase(): string {
  const explicit = (process.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const port = process.env.PORT ?? "3001";
  return `http://localhost:${port}`;
}
