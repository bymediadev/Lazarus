/** Zoom OAuth + RTMS configuration from environment. */

export interface ZoomConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  webhookSecret: string;
  rtmsSupported: boolean;
}

export function getZoomConfig(): ZoomConfig | null {
  const clientId = (process.env.ZOOM_CLIENT_ID ?? process.env.ZM_RTMS_CLIENT ?? "").trim();
  const clientSecret = (process.env.ZOOM_CLIENT_SECRET ?? process.env.ZM_RTMS_SECRET ?? "").trim();
  const redirectUri = (
    process.env.ZOOM_REDIRECT_URI ??
    `${publicApiBase()}/api/integrations/zoom/callback`
  ).trim();
  const webhookSecret = (process.env.ZOOM_WEBHOOK_SECRET_TOKEN ?? "").trim();

  if (!clientId || !clientSecret) return null;

  const rtmsSupported = process.platform === "linux" || process.platform === "darwin";

  return { clientId, clientSecret, redirectUri, webhookSecret, rtmsSupported };
}

export function isZoomConfigured(): boolean {
  return getZoomConfig() !== null;
}

function publicApiBase(): string {
  const explicit = (process.env.PUBLIC_API_URL ?? "").trim().replace(/\/$/, "");
  if (explicit) return explicit;
  const port = process.env.PORT ?? "3001";
  return `http://localhost:${port}`;
}

/** Scopes for OAuth + RTMS live transcripts. */
export const ZOOM_OAUTH_SCOPES = [
  "user:read:user",
  "meeting:read:meeting_transcripts",
  "meeting:update:participant_rtms_app_status",
].join(" ");
