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

/** Only bounce OAuth back to a listed frontend origin (never an open redirect). */
export function pickAllowedFrontendOrigin(raw: unknown): string | null {
  const origin = stripSlash(String(raw ?? "").trim());
  if (!origin) return null;
  return corsAllowedOrigins().includes(origin) ? origin : null;
}

export type OAuthStateMeta = {
  userId?: string | null;
  purpose?: "login" | "connect";
  returnOrigin?: string | null;
  returnPath?: "/login" | "/portal" | null;
};

export type ParsedOAuthState = {
  ok: boolean;
  userId: string | null;
  purpose: "login" | "connect";
  returnOrigin: string | null;
  returnPath: "/login" | "/portal" | null;
};

function stateSecret(fallback: string): string {
  const secret = (process.env.OAUTH_STATE_SECRET ?? "").trim() || fallback.trim();
  if (!secret) {
    throw new Error("OAuth state secret missing — set OAUTH_STATE_SECRET (or the provider client secret).");
  }
  return secret;
}

export function createSignedOAuthState(secretFallback: string, meta?: OAuthStateMeta): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const exp = String(Date.now() + OAUTH_STATE_TTL_MS);
  const userId = (meta?.userId ?? "").replace(/[^a-zA-Z0-9-]/g, "") || "-";
  const purpose = meta?.purpose === "connect" ? "connect" : "login";
  const origin = pickAllowedFrontendOrigin(meta?.returnOrigin);
  const pathKey =
    meta?.returnPath === "/portal" ? "portal" : meta?.returnPath === "/login" ? "login" : "";
  const originB64 = origin ? Buffer.from(origin, "utf8").toString("base64url") : "";
  const payload =
    originB64 && pathKey
      ? `${nonce}.${exp}.${userId}.${purpose}.${originB64}.${pathKey}`
      : `${nonce}.${exp}.${userId}.${purpose}`;
  const sig = crypto.createHmac("sha256", stateSecret(secretFallback)).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function readSignedOAuthState(
  state: string | undefined,
  secretFallback: string
): ParsedOAuthState {
  const empty: ParsedOAuthState = {
    ok: false,
    userId: null,
    purpose: "login",
    returnOrigin: null,
    returnPath: null,
  };
  if (!state) return empty;
  const parts = state.split(".");
  let payload = "";
  let sig = "";
  let userId: string | null = null;
  let purpose: "login" | "connect" = "login";
  let exp = "";
  let returnOrigin: string | null = null;
  let returnPath: "/login" | "/portal" | null = null;

  if (parts.length === 7) {
    const [nonce, expPart, uid, purposePart, originB64, pathKey, sigPart] = parts;
    if (!nonce || !expPart || !uid || !purposePart || !originB64 || !pathKey || !sigPart) return empty;
    payload = `${nonce}.${expPart}.${uid}.${purposePart}.${originB64}.${pathKey}`;
    sig = sigPart;
    exp = expPart;
    userId = uid === "-" ? null : uid;
    purpose = purposePart === "connect" ? "connect" : "login";
    try {
      returnOrigin = pickAllowedFrontendOrigin(Buffer.from(originB64, "base64url").toString("utf8"));
    } catch {
      return empty;
    }
    returnPath = pathKey === "portal" ? "/portal" : "/login";
  } else if (parts.length === 5) {
    const [nonce, expPart, uid, purposePart, sigPart] = parts;
    if (!nonce || !expPart || !uid || !purposePart || !sigPart) return empty;
    payload = `${nonce}.${expPart}.${uid}.${purposePart}`;
    sig = sigPart;
    exp = expPart;
    userId = uid === "-" ? null : uid;
    purpose = purposePart === "connect" ? "connect" : "login";
  } else if (parts.length === 3) {
    const [nonce, expPart, sigPart] = parts;
    if (!nonce || !expPart || !sigPart) return empty;
    payload = `${nonce}.${expPart}`;
    sig = sigPart;
    exp = expPart;
  } else {
    return empty;
  }

  let secret: string;
  try {
    secret = stateSecret(secretFallback);
  } catch {
    return empty;
  }

  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  try {
    const a = Buffer.from(sig, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return empty;
  } catch {
    return empty;
  }

  const expiry = Number(exp);
  if (!Number.isFinite(expiry) || Date.now() > expiry) return empty;
  return { ok: true, userId, purpose, returnOrigin, returnPath };
}

export function verifySignedOAuthState(
  state: string | undefined,
  secretFallback: string
): boolean {
  return readSignedOAuthState(state, secretFallback).ok;
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

export function oauthFrontendReturnUrl(
  parsed: ParsedOAuthState,
  query: Record<string, string>
): string {
  const origin =
    pickAllowedFrontendOrigin(parsed.returnOrigin) ?? resolveFrontendOrigin();
  const path =
    parsed.purpose === "connect"
      ? "/portal"
      : parsed.returnPath === "/portal"
        ? "/portal"
        : "/login";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${origin}${path}?${qs}` : `${origin}${path}`;
}

export function publicApiBase(): string {
  const explicit = (process.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const port = process.env.PORT ?? "3001";
  return `http://localhost:${port}`;
}
