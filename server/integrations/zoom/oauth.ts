import { getZoomConfig, ZOOM_OAUTH_SCOPES } from "./config.js";
import { clearZoomTokens, loadZoomTokens, saveZoomTokens, type ZoomTokenRecord } from "./tokens.js";

const ZOOM_AUTH_URL = "https://zoom.us/oauth/authorize";
const ZOOM_TOKEN_URL = "https://zoom.us/oauth/token";
const ZOOM_REVOKE_URL = "https://zoom.us/oauth/revoke";
const ZOOM_USER_URL = "https://api.zoom.us/v2/users/me";

interface ZoomTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

function basicAuthHeader(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
}

export function buildZoomAuthorizeUrl(state: string): string {
  const cfg = getZoomConfig();
  if (!cfg) throw new Error("Zoom OAuth is not configured");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    state,
    scope: ZOOM_OAUTH_SCOPES,
  });
  return `${ZOOM_AUTH_URL}?${params.toString()}`;
}

export async function exchangeZoomCode(code: string): Promise<ZoomTokenRecord> {
  const cfg = getZoomConfig();
  if (!cfg) throw new Error("Zoom OAuth is not configured");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: cfg.redirectUri,
  });

  const res = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = (await res.json()) as ZoomTokenResponse & { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Zoom token exchange failed (${res.status})`);
  }

  let account_email: string | undefined;
  let zoom_user_id: string | undefined;
  let zoom_account_id: string | undefined;
  try {
    const userRes = await fetch(ZOOM_USER_URL, {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as {
        email?: string;
        id?: string;
        account_id?: string;
      };
      account_email = user.email;
      zoom_user_id = user.id;
      zoom_account_id = user.account_id;
    }
  } catch {
    /* optional */
  }

  const record: ZoomTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    account_email,
    zoom_user_id,
    zoom_account_id,
    connected_at: new Date().toISOString(),
  };
  saveZoomTokens(record);
  return record;
}

/** Revoke stored tokens at Zoom, then clear local storage (Marketplace deauth). */
export async function revokeAndClearZoomTokens(): Promise<void> {
  const cfg = getZoomConfig();
  const stored = loadZoomTokens();
  if (cfg && stored?.access_token) {
    try {
      const body = new URLSearchParams({ token: stored.access_token });
      const res = await fetch(ZOOM_REVOKE_URL, {
        method: "POST",
        headers: {
          Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });
      if (!res.ok) {
        console.warn("[zoom-oauth] revoke returned", res.status);
      }
    } catch (err) {
      console.warn("[zoom-oauth] revoke failed:", err instanceof Error ? err.message : err);
    }
  }
  clearZoomTokens();
}

export async function getValidZoomAccessToken(): Promise<string | null> {
  const cfg = getZoomConfig();
  const stored = loadZoomTokens();
  if (!cfg || !stored?.access_token) return null;

  const expiresAt = new Date(stored.expires_at).getTime();
  if (Date.now() < expiresAt - 60_000) return stored.access_token;

  if (!stored.refresh_token) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: stored.refresh_token,
  });

  const res = await fetch(ZOOM_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(cfg.clientId, cfg.clientSecret),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  const data = (await res.json()) as ZoomTokenResponse & { error?: string };
  if (!res.ok) {
    console.warn("[zoom-oauth] refresh failed:", data.error ?? res.status);
    return null;
  }

  const record: ZoomTokenRecord = {
    ...stored,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  saveZoomTokens(record);
  return record.access_token;
}
