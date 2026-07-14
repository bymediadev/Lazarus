import { publicApiBase } from "../oauthShared.js";

export interface GoogleMeetConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Google OAuth for Meet/Workspace — live captions ingest lands later; Connect works now. */
export function getGoogleMeetConfig(): GoogleMeetConfig | null {
  const clientId = (process.env.GOOGLE_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET ?? "").trim();
  const redirectUri = (
    process.env.GOOGLE_REDIRECT_URI ??
    `${publicApiBase()}/api/integrations/google/callback`
  ).trim();

  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function isGoogleMeetConfigured(): boolean {
  return getGoogleMeetConfig() !== null;
}

export const GOOGLE_MEET_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/meetings.space.readonly",
].join(" ");
