import { createUserTokenStore } from "../userTokenStore.js";

export interface HubSpotTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  hub_id?: string;
  hub_domain?: string;
  connected_at: string;
}

const store = createUserTokenStore<HubSpotTokenRecord>("hubspot-tokens.json");

export function loadHubSpotTokens(userId: string): HubSpotTokenRecord | null {
  return store.load(userId);
}

export function saveHubSpotTokens(userId: string, record: HubSpotTokenRecord): void {
  store.save(userId, record);
}

export function clearHubSpotTokens(userId: string): void {
  store.clear(userId);
}

export function isHubSpotConnected(userId: string): boolean {
  return !!store.load(userId)?.access_token;
}

export function hasAnyHubSpotTokens(): boolean {
  return store.hasAny();
}
