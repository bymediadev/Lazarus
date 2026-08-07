import { getSalesforceConfig, SALESFORCE_OAUTH_SCOPES } from "./config.js";
import {
  loadSalesforceTokens,
  saveSalesforceTokens,
  type SalesforceTokenRecord,
} from "./tokens.js";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  instance_url: string;
  issued_at?: string;
  token_type?: string;
}

export function buildSalesforceAuthorizeUrl(state: string): string {
  const cfg = getSalesforceConfig();
  if (!cfg) throw new Error("Salesforce OAuth is not configured");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: SALESFORCE_OAUTH_SCOPES,
    state,
  });
  return `${cfg.loginUrl}/services/oauth2/authorize?${params.toString()}`;
}

async function fetchUserEmail(
  instanceUrl: string,
  accessToken: string
): Promise<string | undefined> {
  try {
    const res = await fetch(`${instanceUrl}/services/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return undefined;
    const data = (await res.json()) as { email?: string };
    return data.email?.trim() || undefined;
  } catch {
    return undefined;
  }
}

export async function exchangeSalesforceCode(code: string): Promise<SalesforceTokenRecord> {
  const cfg = getSalesforceConfig();
  if (!cfg) throw new Error("Salesforce OAuth is not configured");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });

  const res = await fetch(`${cfg.loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) {
    throw new Error(
      data.error_description ?? data.error ?? `Salesforce token exchange failed (${res.status})`
    );
  }

  const existing = loadSalesforceTokens();
  const email = await fetchUserEmail(data.instance_url, data.access_token);
  const record: SalesforceTokenRecord = {
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? existing?.refresh_token ?? "",
    instance_url: data.instance_url,
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    account_email: email ?? existing?.account_email,
    connected_at: new Date().toISOString(),
  };
  saveSalesforceTokens(record);
  return record;
}

export async function getValidSalesforceAccessToken(): Promise<{
  accessToken: string;
  instanceUrl: string;
} | null> {
  const cfg = getSalesforceConfig();
  const stored = loadSalesforceTokens();
  if (!cfg || !stored?.access_token || !stored.instance_url) return null;

  if (Date.now() < new Date(stored.expires_at).getTime() - 60_000) {
    return { accessToken: stored.access_token, instanceUrl: stored.instance_url };
  }
  if (!stored.refresh_token) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: stored.refresh_token,
  });

  const res = await fetch(`${cfg.loginUrl}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse & { error_description?: string };
  if (!res.ok) {
    console.warn("[salesforce-oauth] refresh failed:", data.error_description ?? res.status);
    return null;
  }

  const record: SalesforceTokenRecord = {
    ...stored,
    access_token: data.access_token,
    instance_url: data.instance_url ?? stored.instance_url,
    refresh_token: data.refresh_token ?? stored.refresh_token,
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
  };
  saveSalesforceTokens(record);
  return { accessToken: record.access_token, instanceUrl: record.instance_url };
}
