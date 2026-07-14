import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface GoogleTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  connected_at: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../../.data");
const TOKEN_PATH = path.join(DATA_DIR, "google-tokens.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadGoogleTokens(): GoogleTokenRecord | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    const raw = readFileSync(TOKEN_PATH, "utf8").trim();
    if (!raw) return null;
    return JSON.parse(raw) as GoogleTokenRecord;
  } catch {
    return null;
  }
}

export function saveGoogleTokens(record: GoogleTokenRecord): void {
  ensureDataDir();
  writeFileSync(TOKEN_PATH, JSON.stringify(record, null, 2), "utf8");
}

export function clearGoogleTokens(): void {
  if (existsSync(TOKEN_PATH)) writeFileSync(TOKEN_PATH, "", "utf8");
}

export function isGoogleConnected(): boolean {
  return !!loadGoogleTokens()?.access_token;
}
