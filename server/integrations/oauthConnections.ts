import crypto from "crypto";
import { decryptSecretJson, encryptSecretJson } from "../cryptoSecrets.js";
import { serviceRoleClient } from "../founderAuth.js";
import { createUserTokenStore } from "./userTokenStore.js";

export type OAuthProviderName = "google" | "zoom" | "hubspot" | "salesforce" | "teams";

type TokenShape = {
  access_token?: string;
  account_email?: string;
  connected_at?: string;
};

export function webhookSecretHash(secret: string | undefined): string | null {
  const value = (secret ?? "").trim();
  if (!value) return null;
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function createPersistedTokenStore<T extends TokenShape>(
  provider: OAuthProviderName,
  filename: string,
  extras?: {
    portalId?: (record: T) => string | undefined;
    webhookSecret?: (record: T) => string | undefined;
  }
) {
  const file = createUserTokenStore<T>(filename);
  let hydrated = false;

  async function persist(userId: string, record: T): Promise<void> {
    const sb = serviceRoleClient();
    if (!sb || !userId) return;
    const { error } = await sb.from("oauth_connections").upsert(
      {
        user_id: userId,
        provider,
        token_blob: encryptSecretJson(record),
        portal_id: extras?.portalId?.(record) ?? null,
        account_email: record.account_email ?? null,
        webhook_secret_hash: webhookSecretHash(extras?.webhookSecret?.(record)),
        connected_at: record.connected_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider" }
    );
    if (error) console.warn(`[oauth ${provider}] save failed:`, error.message);
  }

  async function deleteRow(userId: string): Promise<void> {
    const sb = serviceRoleClient();
    if (!sb || !userId) return;
    const { error } = await sb
      .from("oauth_connections")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider);
    if (error) console.warn(`[oauth ${provider}] clear failed:`, error.message);
  }

  return {
    load(userId: string): T | null {
      return file.load(userId);
    },
    save(userId: string, record: T): void {
      file.save(userId, record);
      void persist(userId, record);
    },
    clear(userId: string): void {
      file.clear(userId);
      void deleteRow(userId);
    },
    async clearAndWait(userId: string): Promise<void> {
      file.clear(userId);
      await deleteRow(userId);
    },
    hasAny(): boolean {
      return file.hasAny();
    },
    findUserId(predicate: (record: T, userId: string) => boolean): string | null {
      return file.findUserId(predicate);
    },
    async hydrate(): Promise<void> {
      if (hydrated) return;
      hydrated = true;
      const sb = serviceRoleClient();
      if (!sb) return;
      const { data, error } = await sb
        .from("oauth_connections")
        .select("user_id, token_blob")
        .eq("provider", provider);
      if (error || !data) return;
      for (const row of data) {
        const userId = String(row.user_id ?? "").trim();
        if (!userId || file.load(userId)?.access_token) continue;
        try {
          const record = decryptSecretJson<T>(String(row.token_blob ?? ""));
          if (record?.access_token) file.save(userId, record);
        } catch {
          /* skip undecryptable rows */
        }
      }
    },
  };
}

export async function deleteOAuthConnectionsForUser(userId: string): Promise<void> {
  const sb = serviceRoleClient();
  if (!sb || !userId) return;
  await sb.from("oauth_connections").delete().eq("user_id", userId);
  await sb.from("google_oauth_tokens").delete().eq("id", userId);
}
