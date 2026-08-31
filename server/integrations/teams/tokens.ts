import { createUserTokenStore } from "../userTokenStore.js";

export interface TeamsTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  connected_at: string;
}

const store = createUserTokenStore<TeamsTokenRecord>("teams-tokens.json");

export function loadTeamsTokens(userId: string): TeamsTokenRecord | null {
  return store.load(userId);
}

export function saveTeamsTokens(userId: string, record: TeamsTokenRecord): void {
  store.save(userId, record);
}

export function clearTeamsTokens(userId: string): void {
  store.clear(userId);
}

export function isTeamsConnected(userId: string): boolean {
  return !!store.load(userId)?.access_token;
}

export function hasAnyTeamsTokens(): boolean {
  return store.hasAny();
}
