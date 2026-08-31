import { createUserTokenStore } from "../userTokenStore.js";

export interface ZoomTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  account_id?: string;
  connected_at: string;
}

const store = createUserTokenStore<ZoomTokenRecord>("zoom-tokens.json");

export function loadZoomTokens(userId: string): ZoomTokenRecord | null {
  return store.load(userId);
}

export function saveZoomTokens(userId: string, record: ZoomTokenRecord): void {
  store.save(userId, record);
}

export function clearZoomTokens(userId: string): void {
  store.clear(userId);
}

export function isZoomConnected(userId: string): boolean {
  return !!store.load(userId)?.access_token;
}

export function hasAnyZoomTokens(): boolean {
  return store.hasAny();
}

export function findZoomUserIdByAccount(email?: string, accountId?: string): string | null {
  const e = (email ?? "").trim().toLowerCase();
  const id = (accountId ?? "").trim();
  return store.findUserId((row) => {
    if (id && row.account_id === id) return true;
    if (e && (row.account_email ?? "").trim().toLowerCase() === e) return true;
    return false;
  });
}
