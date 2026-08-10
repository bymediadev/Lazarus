export interface WhiteWhaleConfig {
  apiKey: string;
  userEmail: string;
  baseUrl: string;
}

const DEFAULT_BASE = "https://app.getwhitewhale.com";

export function getWhiteWhaleConfig(): WhiteWhaleConfig | null {
  const apiKey = (process.env.WHITE_WHALE_API_KEY ?? "").trim();
  const userEmail = (process.env.WHITE_WHALE_USER_EMAIL ?? "").trim();
  const baseUrl = (process.env.WHITE_WHALE_BASE_URL ?? DEFAULT_BASE).trim().replace(/\/$/, "");

  if (!apiKey || !userEmail) return null;
  return { apiKey, userEmail, baseUrl };
}

export function isWhiteWhaleConfigured(): boolean {
  return getWhiteWhaleConfig() !== null;
}
