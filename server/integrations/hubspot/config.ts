import { publicApiBase } from "../oauthShared.js";

export interface HubSpotConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** HubSpot OAuth — read-only deals + notes for Deal Profile import. */
export function getHubSpotConfig(): HubSpotConfig | null {
  const clientId = (process.env.HUBSPOT_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.HUBSPOT_CLIENT_SECRET ?? "").trim();
  const redirectUri = (
    process.env.HUBSPOT_REDIRECT_URI ??
    `${publicApiBase()}/api/integrations/hubspot/callback`
  ).trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isHubSpotConfigured(): boolean {
  return getHubSpotConfig() !== null;
}

/** Minimal read-only scopes — no write, no contacts/companies. */
export const HUBSPOT_OAUTH_SCOPES = [
  "oauth",
  "crm.objects.deals.read",
  "crm.objects.notes.read",
].join(" ");
