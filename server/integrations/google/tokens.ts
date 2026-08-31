import { serviceRoleClient } from "../../founderAuth.js";
import { createUserTokenStore } from "../userTokenStore.js";
import { decryptSecretJson, encryptSecretJson } from "../../cryptoSecrets.js";

export interface GoogleTokenRecord {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  account_email?: string;
  connected_at: string;
}

const store = createUserTokenStore<GoogleTokenRecord>("google-tokens.json");

function wrapToken(value: string): string {
  return encryptSecretJson({ s: value });
}

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

function rowToRecord(row: {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  account_email: string | null;
  connected_at: string;
}): GoogleTokenRecord {
  return {
    access_token: unwrapToken(row.access_token),
    refresh_token: unwrapToken(row.refresh_token),
    expires_at: row.expires_at,
    account_email: row.account_email ?? undefined,
    connected_at: row.connected_at,
  };
}

async function persistToSupabase(userId: string, record: GoogleTokenRecord): Promise<void> {
  const sb = serviceRoleClient();
  if (!sb) return;
  const { error } = await sb.from("google_oauth_tokens").upsert(
    {
      id: userId,
      access_token: wrapToken(record.access_token),
      refresh_token: wrapToken(record.refresh_token),
      expires_at: record.expires_at,
      account_email: record.account_email ?? null,
      connected_at: record.connected_at,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.warn("[google-tokens] supabase save failed:", error.message);
  }
}

async function deleteFromSupabase(userId: string): Promise<void> {
  const sb = serviceRoleClient();
  if (!sb) return;
  const { error } = await sb.from("google_oauth_tokens").delete().eq("id", userId);
  if (error) {
    console.warn("[google-tokens] supabase clear failed:", error.message);
  }
}

export function loadGoogleTokens(userId: string): GoogleTokenRecord | null {
  return store.load(userId);
}

export async function ensureGoogleTokensHydrated(): Promise<void> {
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
    store.save(userId, rowToRecord(row));
  }
}

export function saveGoogleTokens(userId: string, record: GoogleTokenRecord): void {
  store.save(userId, record);
  void persistToSupabase(userId, record);
}

export async function clearGoogleTokens(userId: string): Promise<void> {
  store.clear(userId);
  await deleteFromSupabase(userId);
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
