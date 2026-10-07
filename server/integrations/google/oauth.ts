import {
  getGoogleConnectConfig,
  getGoogleOAuthConfig,
  GOOGLE_LOGIN_SCOPES,
  GOOGLE_MEET_SCOPES,
} from "./config.js";
import { loadGoogleTokens, saveGoogleTokens, type GoogleTokenRecord } from "./tokens.js";
import { secureFetch } from "../../secureFetch.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  id_token?: string;
}

export interface GoogleIdentity {
  email?: string;
  email_verified: boolean;
  provider_sub?: string;
}

function verifiedFlag(value: unknown): boolean | null {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return null;
}

function claimsIdentity(raw: unknown): GoogleIdentity {
  const claims = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const email = typeof claims.email === "string" ? claims.email.trim() : "";
  const subRaw = claims.sub ?? claims.id;
  const providerSub = subRaw == null ? "" : String(subRaw).trim();
  const verified = verifiedFlag(claims.email_verified) ?? verifiedFlag(claims.verified_email);
  return {
    email: email || undefined,
    email_verified: verified === true,
    provider_sub: providerSub || undefined,
  };
}

/** Payload only. The token came from Google's token endpoint, not the browser. */
function identityFromIdToken(idToken: string | undefined, audience: string): GoogleIdentity {
  const empty: GoogleIdentity = { email_verified: false };
  if (!idToken || !audience) return empty;
  const payload = idToken.split(".")[1];
  if (!payload) return empty;
  try {
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json = Buffer.from(padded, "base64").toString("utf8");
    const claims = JSON.parse(json) as Record<string, unknown>;
    const iss = claims.iss;
    if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") return empty;
    const aud = claims.aud;
    const audiences = Array.isArray(aud) ? aud.map(String) : [String(aud ?? "")];
    if (!audiences.includes(audience)) return empty;
    return claimsIdentity(claims);
  } catch {
    return empty;
  }
}

/**
 * Login scopes are OpenID, but the v2 userinfo endpoint uses `verified_email` and `id`.
 * The OIDC userinfo endpoint and the ID token use `email_verified` and `sub`.
 */
export function readGoogleIdentity(input: {
  userinfo?: unknown;
  idToken?: string;
  audience: string;
}): GoogleIdentity {
  const fromUserinfo = claimsIdentity(input.userinfo);
  const fromToken = identityFromIdToken(input.idToken, input.audience);
  const userinfoVerified = verifiedFlag(
    input.userinfo && typeof input.userinfo === "object"
      ? (input.userinfo as Record<string, unknown>).email_verified ??
          (input.userinfo as Record<string, unknown>).verified_email
      : undefined
  );
  return {
    email: fromUserinfo.email ?? fromToken.email,
    email_verified: (userinfoVerified ?? fromToken.email_verified) === true,
    provider_sub: fromUserinfo.provider_sub ?? fromToken.provider_sub,
  };
}

export function buildGoogleAuthorizeUrl(
  state: string,
  purpose: "login" | "connect" = "connect"
): string {
  const cfg = getGoogleOAuthConfig(purpose);
  if (!cfg) throw new Error("Google OAuth is not configured");

  const login = purpose === "login";
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: login ? GOOGLE_LOGIN_SCOPES : GOOGLE_MEET_SCOPES,
    access_type: login ? "online" : "offline",
    prompt: login ? "select_account" : "consent",
    state,
  });
  if (login) params.set("include_granted_scopes", "false");
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(
  code: string,
  userId?: string,
  purpose: "login" | "connect" = "login"
): Promise<GoogleTokenRecord> {
  const cfg = getGoogleOAuthConfig(purpose);
  if (!cfg) throw new Error("Google OAuth is not configured");

  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });

  let res: Response;
  try {
    res = await secureFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/UNABLE_TO_VERIFY|certificate/i.test(msg)) {
      throw new Error(
        "Google sign-in failed (Windows TLS). Run: powershell -File scripts/export-windows-cas.ps1 then restart npm run dev."
      );
    }
    throw err;
  }

  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(
      data.error_description ?? data.error ?? `Google token exchange failed (${res.status})`
    );
  }

  let userinfo: unknown = null;
  try {
    const userRes = await secureFetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) userinfo = await userRes.json();
    else console.warn("[google-oauth] userinfo failed:", userRes.status);
  } catch (err) {
    console.warn("[google-oauth] userinfo failed:", err instanceof Error ? err.message : err);
  }
  const identity = readGoogleIdentity({
    userinfo,
    idToken: data.id_token,
    audience: cfg.clientId,
  });

  const existing = userId ? loadGoogleTokens(userId) : null;
  const record: GoogleTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    account_email: identity.email,
    email_verified: identity.email_verified,
    provider_sub: identity.provider_sub,
    connected_at: new Date().toISOString(),
  };
  if (userId) saveGoogleTokens(userId, record);
  return record;
}

export async function getValidGoogleAccessToken(userId: string): Promise<string | null> {
  const cfg = getGoogleConnectConfig();
  const stored = loadGoogleTokens(userId);
  if (!cfg || !stored?.access_token) return null;

  if (Date.now() < new Date(stored.expires_at).getTime() - 60_000) {
    return stored.access_token;
  }
  if (!stored.refresh_token) return null;

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: stored.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await secureFetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse & { error?: string };
  if (!res.ok) {
    console.warn("[google-oauth] refresh failed:", data.error ?? res.status);
    return null;
  }

  const record: GoogleTokenRecord = {
    ...stored,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  saveGoogleTokens(userId, record);
  return record.access_token;
}
