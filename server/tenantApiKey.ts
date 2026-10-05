import crypto from "crypto";
import { secretsEqual } from "./cryptoSecrets.js";
import { serviceRoleClient } from "./founderAuth.js";

export function hashTenantApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function createTenantApiKey(): { raw: string; prefix: string; hash: string } {
  const id = crypto.randomBytes(4).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");
  const prefix = `ldr_${id}`;
  const raw = `${prefix}_${secret}`;
  return { raw, prefix, hash: hashTenantApiKey(raw) };
}

export type ApiKeyDecision =
  | { ok: true; tenantId: string | null }
  | { ok: false; status: 401 };

/**
 * Site key unlocks the browser and attaches no company.
 * A tenant hash attaches that company.
 * A configured site key rejects anything else. With no site key, an unknown header stays anonymous.
 */
export function decideApiKey(input: {
  header: string | null | undefined;
  siteKey: string | null | undefined;
  tenantIdForHeader: string | null;
}): ApiKeyDecision {
  const header = (input.header ?? "").trim();
  const siteKey = (input.siteKey ?? "").trim();
  if (header && siteKey && secretsEqual(header, siteKey)) {
    return { ok: true, tenantId: null };
  }
  if (input.tenantIdForHeader) {
    return { ok: true, tenantId: input.tenantIdForHeader };
  }
  if (siteKey) return { ok: false, status: 401 };
  return { ok: true, tenantId: null };
}

export async function findTenantIdByApiKey(raw: string | null | undefined): Promise<string | null> {
  const key = (raw ?? "").trim();
  if (!key) return null;
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  const hash = hashTenantApiKey(key);
  const { data, error } = await supabase
    .from("tenants")
    .select("id, api_key_hash")
    .eq("api_key_hash", hash)
    .maybeSingle();
  if (error || !data?.id || !data.api_key_hash) return null;
  if (!secretsEqual(String(data.api_key_hash), hash)) return null;
  return String(data.id);
}
