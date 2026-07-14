import { getGoogleMeetConfig, GOOGLE_MEET_SCOPES } from "./config.js";
import { loadGoogleTokens, saveGoogleTokens, type GoogleTokenRecord } from "./tokens.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export function buildGoogleAuthorizeUrl(state: string): string {
  const cfg = getGoogleMeetConfig();
  if (!cfg) throw new Error("Google Meet OAuth is not configured");

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: GOOGLE_MEET_SCOPES,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleCode(code: string): Promise<GoogleTokenRecord> {
  const cfg = getGoogleMeetConfig();
  if (!cfg) throw new Error("Google Meet OAuth is not configured");

  const body = new URLSearchParams({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? `Google token exchange failed (${res.status})`);
  }

  let account_email: string | undefined;
  try {
    const userRes = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as { email?: string };
      account_email = user.email;
    }
  } catch {
    /* optional */
  }

  const existing = loadGoogleTokens();
  const record: GoogleTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    account_email,
    connected_at: new Date().toISOString(),
  };
  saveGoogleTokens(record);
  return record;
}

export async function getValidGoogleAccessToken(): Promise<string | null> {
  const cfg = getGoogleMeetConfig();
  const stored = loadGoogleTokens();
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

  const res = await fetch(TOKEN_URL, {
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
  saveGoogleTokens(record);
  return record.access_token;
}
