import { publicApiBase } from "../oauthShared.js";

export interface TeamsConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
}

/** Microsoft Entra ID (Azure AD) app for Teams / Graph — transcript pull lands later. */
export function getTeamsConfig(): TeamsConfig | null {
  const clientId = (
    process.env.TEAMS_CLIENT_ID ??
    process.env.AZURE_CLIENT_ID ??
    ""
  ).trim();
  const clientSecret = (
    process.env.TEAMS_CLIENT_SECRET ??
    process.env.AZURE_CLIENT_SECRET ??
    ""
  ).trim();
  const tenantId = (
    process.env.TEAMS_TENANT_ID ??
    process.env.AZURE_TENANT_ID ??
    "common"
  ).trim();
  const redirectUri = (
    process.env.TEAMS_REDIRECT_URI ??
    `${publicApiBase()}/api/integrations/teams/callback`
  ).trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, tenantId, redirectUri };
}

export function isTeamsConfigured(): boolean {
  return getTeamsConfig() !== null;
}

export const TEAMS_GRAPH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "User.Read",
  "OnlineMeetings.Read",
  "OnlineMeetingTranscript.Read.All",
].join(" ");
