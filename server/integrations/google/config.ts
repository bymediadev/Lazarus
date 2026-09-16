import { publicApiBase } from "../oauthShared.js";

export interface GoogleMeetConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

function envTrim(key: string): string {
  return (process.env[key] ?? "").trim();
}

function defaultRedirect(): string {
  return `${publicApiBase()}/api/integrations/google/callback`;
}

function configFrom(clientId: string, clientSecret: string, redirectUri: string): GoogleMeetConfig | null {
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri: redirectUri || defaultRedirect() };
}

/** Sign in with Google — identity-only Cloud project (`GOOGLE_*`). */
export function getGoogleLoginConfig(): GoogleMeetConfig | null {
  return configFrom(
    envTrim("GOOGLE_CLIENT_ID"),
    envTrim("GOOGLE_CLIENT_SECRET"),
    envTrim("GOOGLE_REDIRECT_URI") || defaultRedirect()
  );
}

/**
 * Gmail Connect — separate Cloud project. Does not fall back to login, so
 * `gmail.readonly` cannot taint the identity-only client.
 */
export function getGoogleConnectConfig(): GoogleMeetConfig | null {
  return configFrom(
    envTrim("GOOGLE_CONNECT_CLIENT_ID"),
    envTrim("GOOGLE_CONNECT_CLIENT_SECRET"),
    envTrim("GOOGLE_CONNECT_REDIRECT_URI") || envTrim("GOOGLE_REDIRECT_URI") || defaultRedirect()
  );
}

export function getGoogleOAuthConfig(purpose: "login" | "connect"): GoogleMeetConfig | null {
  return purpose === "connect" ? getGoogleConnectConfig() : getGoogleLoginConfig();
}

/** Gmail Connect credentials (Connect env, else login env). */
export function getGoogleMeetConfig(): GoogleMeetConfig | null {
  return getGoogleConnectConfig();
}

export function isGoogleLoginConfigured(): boolean {
  return getGoogleLoginConfig() !== null;
}

export function isGoogleMeetConfigured(): boolean {
  return getGoogleConnectConfig() !== null;
}

export const GOOGLE_LOGIN_SCOPES = "openid email profile";

/** Connect Gmail only. Calendar/Meet APIs are unused — live captions use the Chrome extension. */
export const GOOGLE_MEET_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");
