import { getTeamsConfig, TEAMS_GRAPH_SCOPES } from "./config.js";
import { loadTeamsTokens, saveTeamsTokens, type TeamsTokenRecord } from "./tokens.js";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

function authBase(tenantId: string): string {
  return `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0`;
}

export function buildTeamsAuthorizeUrl(state: string): string {
  const cfg = getTeamsConfig();
  if (!cfg) throw new Error("Teams OAuth is not configured");

  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: TEAMS_GRAPH_SCOPES,
    state,
  });
  return `${authBase(cfg.tenantId)}/authorize?${params.toString()}`;
}

export async function exchangeTeamsCode(code: string): Promise<TeamsTokenRecord> {
  const cfg = getTeamsConfig();
  if (!cfg) throw new Error("Teams OAuth is not configured");

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    scope: TEAMS_GRAPH_SCOPES,
  });

  const res = await fetch(`${authBase(cfg.tenantId)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(data.error_description ?? data.error ?? `Teams token exchange failed (${res.status})`);
  }

  let account_email: string | undefined;
  try {
    const userRes = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${data.access_token}` },
    });
    if (userRes.ok) {
      const user = (await userRes.json()) as { mail?: string; userPrincipalName?: string };
      account_email = user.mail ?? user.userPrincipalName;
    }
  } catch {
    /* optional */
  }

  const existing = loadTeamsTokens();
  const record: TeamsTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existing?.refresh_token ?? "",
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
    account_email,
    connected_at: new Date().toISOString(),
  };
  saveTeamsTokens(record);
  return record;
}

export async function getValidTeamsAccessToken(): Promise<string | null> {
  const cfg = getTeamsConfig();
  const stored = loadTeamsTokens();
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
    scope: TEAMS_GRAPH_SCOPES,
  });

  const res = await fetch(`${authBase(cfg.tenantId)}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse & { error?: string };
  if (!res.ok) {
    console.warn("[teams-oauth] refresh failed:", data.error ?? res.status);
    return null;
  }

  const record: TeamsTokenRecord = {
    ...stored,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + data.expires_in * 1000).toISOString(),
  };
  saveTeamsTokens(record);
  return record.access_token;
}
