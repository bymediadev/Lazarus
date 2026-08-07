import { publicApiBase } from "../oauthShared.js";

export interface SalesforceConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  loginUrl: string;
}

export function getSalesforceConfig(): SalesforceConfig | null {
  const clientId = (process.env.SALESFORCE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.SALESFORCE_CLIENT_SECRET ?? "").trim();
  const redirectUri = (
    process.env.SALESFORCE_REDIRECT_URI ??
    `${publicApiBase()}/api/integrations/salesforce/callback`
  ).trim();
  const loginUrl = (
    process.env.SALESFORCE_LOGIN_URL ?? "https://login.salesforce.com"
  ).trim().replace(/\/$/, "");

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri, loginUrl };
}

export function isSalesforceConfigured(): boolean {
  return getSalesforceConfig() !== null;
}

export const SALESFORCE_OAUTH_SCOPES = "api refresh_token offline_access";
