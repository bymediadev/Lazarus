export interface WhiteWhaleConfig {
  apiKey: string;
  userEmail: string;
  baseUrl: string;
}

const DEFAULT_BASE = "https://app.getwhitewhale.com";

/** Paused until Lazarus has a paid WhiteWhale license. Do not call their API. */
const WHITE_WHALE_LICENSED = false;

export function getWhiteWhaleConfig(): WhiteWhaleConfig | null {
  if (!WHITE_WHALE_LICENSED) return null;
  const apiKey = (process.env.WHITE_WHALE_API_KEY ?? "").trim();
  const userEmail = (process.env.WHITE_WHALE_USER_EMAIL ?? "").trim();
  const baseUrl = (process.env.WHITE_WHALE_BASE_URL ?? DEFAULT_BASE).trim().replace(/\/$/, "");

  if (!apiKey || !userEmail) return null;
  return { apiKey, userEmail, baseUrl };
}

export function isWhiteWhaleConfigured(): boolean {
  return getWhiteWhaleConfig() !== null;
}
