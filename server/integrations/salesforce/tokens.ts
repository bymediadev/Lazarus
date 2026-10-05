import crypto from "crypto";
import { secretsEqual } from "../../cryptoSecrets.js";
import { createPersistedTokenStore } from "../oauthConnections.js";

export interface SalesforceTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  instance_url: string;
  account_email?: string;
  email_verified?: boolean;
  provider_sub?: string;
  webhook_secret?: string;
  connected_at?: string;
}

const store = createPersistedTokenStore<SalesforceTokenRecord>("salesforce", "salesforce-tokens.json", {
  portalId: (record) => record.instance_url,
  webhookSecret: (record) => record.webhook_secret,
});

export function ensureSalesforceWebhookSecret(record: SalesforceTokenRecord): SalesforceTokenRecord {
  if ((record.webhook_secret ?? "").trim()) return record;
  return { ...record, webhook_secret: crypto.randomBytes(24).toString("hex") };
}

export function loadSalesforceTokens(userId: string): SalesforceTokenRecord | null {
  return store.load(userId);
}

export function saveSalesforceTokens(userId: string, record: SalesforceTokenRecord): void {
  store.save(userId, ensureSalesforceWebhookSecret(record));
}

export function clearSalesforceTokens(userId: string): void {
  store.clear(userId);
}

export async function clearSalesforceTokensAndWait(userId: string): Promise<void> {
  await store.clearAndWait(userId);
}

export function isSalesforceConnected(userId: string): boolean {
  const t = store.load(userId);
  return !!(t?.access_token && t?.instance_url && t?.refresh_token);
}

export function hasAnySalesforceTokens(): boolean {
  return store.hasAny();
}

export function findSalesforceUserByWebhookSecret(secret: string): string | null {
  const provided = secret.trim();
  if (!provided) return null;
  return store.findUserId((row) => secretsEqual(row.webhook_secret, provided));
}

export function hydrateSalesforceTokens(): Promise<void> {
  return store.hydrate();
}
