import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface HubSpotTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  hub_id?: string;
  hub_domain?: string;
  connected_at: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../../.data");
const TOKEN_PATH = path.join(DATA_DIR, "hubspot-tokens.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadHubSpotTokens(): HubSpotTokenRecord | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    const raw = readFileSync(TOKEN_PATH, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as HubSpotTokenRecord;
  } catch {
    return null;
  }
}

export function saveHubSpotTokens(record: HubSpotTokenRecord): void {
  ensureDataDir();
  writeFileSync(TOKEN_PATH, JSON.stringify(record, null, 2), "utf8");
}

export function clearHubSpotTokens(): void {
  if (existsSync(TOKEN_PATH)) writeFileSync(TOKEN_PATH, "", "utf8");
}

export function isHubSpotConnected(): boolean {
  return !!loadHubSpotTokens()?.access_token;
}
