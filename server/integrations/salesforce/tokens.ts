import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = join(__dirname, "../../../.data/salesforce-tokens.json");

export interface SalesforceTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  instance_url: string;
  account_email?: string;
  connected_at?: string;
}

function ensureDataDir(): void {
  const dir = dirname(TOKEN_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function loadSalesforceTokens(): SalesforceTokenRecord | null {
  try {
    if (!existsSync(TOKEN_PATH)) return null;
    return JSON.parse(readFileSync(TOKEN_PATH, "utf8")) as SalesforceTokenRecord;
  } catch {
    return null;
  }
}

export function saveSalesforceTokens(record: SalesforceTokenRecord): void {
  ensureDataDir();
  writeFileSync(TOKEN_PATH, JSON.stringify(record, null, 2), "utf8");
}

export function clearSalesforceTokens(): void {
  if (existsSync(TOKEN_PATH)) {
    writeFileSync(TOKEN_PATH, "", "utf8");
  }
}

export function isSalesforceConnected(): boolean {
  const t = loadSalesforceTokens();
  return !!(t?.access_token && t?.instance_url && t?.refresh_token);
}
