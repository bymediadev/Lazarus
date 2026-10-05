import { decryptSecretJson } from "../../cryptoSecrets.js";
import { serviceRoleClient } from "../../founderAuth.js";
import { createPersistedTokenStore } from "../oauthConnections.js";

export interface GoogleTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  email_verified?: boolean;
  provider_sub?: string;
  connected_at: string;
}

const store = createPersistedTokenStore<GoogleTokenRecord>("google", "google-tokens.json");

function unwrapToken(raw: string | null | undefined): string {
  const value = String(raw ?? "");
  if (!value) return "";
  if (!value.startsWith("enc:v1:")) return value;
  try {
    return decryptSecretJson<{ s: string }>(value).s;
  } catch {
    return "";
  }
}

/** Copy the old single-table rows into oauth_connections once. */
async function importLegacyGoogleRows(): Promise<void> {
  const sb = serviceRoleClient();
  if (!sb) return;
  const { data, error } = await sb
    .from("google_oauth_tokens")
    .select("id, access_token, refresh_token, expires_at, account_email, connected_at");
  if (error || !data) return;
  for (const row of data) {
    const userId = String(row.id ?? "").trim();
    if (!userId || userId === "default" || !row.access_token) continue;
    if (store.load(userId)?.access_token) continue;
    store.save(userId, {
      access_token: unwrapToken(row.access_token),
      refresh_token: unwrapToken(row.refresh_token),
      expires_at: row.expires_at,
      account_email: row.account_email ?? undefined,
      connected_at: row.connected_at,
    });
  }
}

export function loadGoogleTokens(userId: string): GoogleTokenRecord | null {
  return store.load(userId);
}

export async function ensureGoogleTokensHydrated(): Promise<void> {
  await store.hydrate();
  await importLegacyGoogleRows();
}

export function saveGoogleTokens(userId: string, record: GoogleTokenRecord): void {
  store.save(userId, record);
}

export async function clearGoogleTokens(userId: string): Promise<void> {
  await store.clearAndWait(userId);
}

export function isGoogleConnected(userId: string): boolean {
  return !!store.load(userId)?.access_token;
}

export function hasAnyGoogleTokens(): boolean {
  return store.hasAny();
}

export function hydrateGoogleTokens(): Promise<void> {
  return ensureGoogleTokensHydrated();
}
