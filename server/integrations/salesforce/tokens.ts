import { createUserTokenStore } from "../userTokenStore.js";

export interface SalesforceTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  instance_url: string;
  account_email?: string;
  connected_at?: string;
}

const store = createUserTokenStore<SalesforceTokenRecord>("salesforce-tokens.json");

export function loadSalesforceTokens(userId: string): SalesforceTokenRecord | null {
  return store.load(userId);
}

export function saveSalesforceTokens(userId: string, record: SalesforceTokenRecord): void {
  store.save(userId, record);
}

export function clearSalesforceTokens(userId: string): void {
  store.clear(userId);
}

export function isSalesforceConnected(userId: string): boolean {
  const t = store.load(userId);
  return !!(t?.access_token && t?.instance_url && t?.refresh_token);
}

export function hasAnySalesforceTokens(): boolean {
  return store.hasAny();
}
