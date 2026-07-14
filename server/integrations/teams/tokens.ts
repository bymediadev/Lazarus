import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface TeamsTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  connected_at: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../../.data");
const TOKEN_PATH = path.join(DATA_DIR, "teams-tokens.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadTeamsTokens(): TeamsTokenRecord | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    const raw = readFileSync(TOKEN_PATH, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as TeamsTokenRecord;
  } catch {
    return null;
  }
}

export function saveTeamsTokens(record: TeamsTokenRecord): void {
  ensureDataDir();
  writeFileSync(TOKEN_PATH, JSON.stringify(record, null, 2), "utf8");
}

export function clearTeamsTokens(): void {
  if (existsSync(TOKEN_PATH)) writeFileSync(TOKEN_PATH, "", "utf8");
}

export function isTeamsConnected(): boolean {
  return !!loadTeamsTokens()?.access_token;
}
