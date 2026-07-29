import { getHubSpotConfig, HUBSPOT_OAUTH_SCOPES } from "./config.js";
import { loadHubSpotTokens, saveHubSpotTokens, type HubSpotTokenRecord } from "./tokens.js";

const AUTH_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type?: string;
}

interface AccessTokenInfo {
  user?: string;
  hub_id?: number | string;
  hub_domain?: string;
}

export function buildHubSpotAuthorizeUrl(state: string): string {
  const cfg = getHubSpotConfig();
  if (!cfg) throw new Error("HubSpot OAuth is not configured");

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: HUBSPOT_OAUTH_SCOPES,
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

async function fetchTokenInfo(accessToken: string): Promise<Partial<HubSpotTokenRecord>> {
  try {
    const res = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`);
    if (!res.ok) return {};
    const info = (await res.json()) as AccessTokenInfo;
    return {
      account_email: info.user,
      hub_id: info.hub_id != null ? String(info.hub_id) : undefined,
      hub_domain: info.hub_domain,
    };
  } catch {
    return {};
  }
}

export async function exchangeHubSpotCode(code: string): Promise<HubSpotTokenRecord> {
  const cfg = getHubSpotConfig();
  if (!cfg) throw new Error("HubSpot OAuth is not configured");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as TokenResponse & { message?: string; status?: string };
  if (!res.ok) {
    throw new Error(data.message ?? data.status ?? `HubSpot token exchange failed (${res.status})`);
  }

  const meta = await fetchTokenInfo(data.access_token);
  const existing = loadHubSpotTokens();
  const record: HubSpotTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    account_email: meta.account_email ?? existing?.account_email,
    hub_id: meta.hub_id ?? existing?.hub_id,
    hub_domain: meta.hub_domain ?? existing?.hub_domain,
    connected_at: new Date().toISOString(),
  };
  saveHubSpotTokens(record);
  return record;
}

export async function getValidHubSpotAccessToken(): Promise<string | null> {
  const cfg = getHubSpotConfig();
  const stored = loadHubSpotTokens();
  if (!cfg || !stored?.access_token) return null;

  if (Date.now() < new Date(stored.expires_at).getTime() - 60_000) {
    return stored.access_token;
  }
  if (!stored.refresh_token) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: stored.refresh_token,
  });

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse & { message?: string };
  if (!res.ok) {
    console.warn("[hubspot-oauth] refresh failed:", data.message ?? res.status);
    return null;
  }

  const record: HubSpotTokenRecord = {
    ...stored,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  saveHubSpotTokens(record);
  return record.access_token;
}
