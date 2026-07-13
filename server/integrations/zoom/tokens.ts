import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

export interface ZoomTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  connected_at: string;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "../../../.data");
const TOKEN_PATH = path.join(DATA_DIR, "zoom-tokens.json");

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export function loadZoomTokens(): ZoomTokenRecord | null {
  if (!existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(readFileSync(TOKEN_PATH, "utf8")) as ZoomTokenRecord;
  } catch {
    return null;
  }
}

export function saveZoomTokens(record: ZoomTokenRecord): void {
  ensureDataDir();
  writeFileSync(TOKEN_PATH, JSON.stringify(record, null, 2), "utf8");
}

export function clearZoomTokens(): void {
  if (existsSync(TOKEN_PATH)) writeFileSync(TOKEN_PATH, "", "utf8");
}

export function isZoomConnected(): boolean {
  const t = loadZoomTokens();
  return !!t?.access_token;
}
