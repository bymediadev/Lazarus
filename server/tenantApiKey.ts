import crypto from "crypto";
import { secretsEqual } from "./cryptoSecrets.js";
import { serviceRoleClient } from "./founderAuth.js";

export function hashTenantApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export function createTenantApiKey(): { raw: string; prefix: string; hash: string } {
  const id = crypto.randomBytes(4).toString("hex");
  const secret = crypto.randomBytes(24).toString("hex");
  const prefix = `lz_${id}`;
  const raw = `${prefix}_${secret}`;
  return { raw, prefix, hash: hashTenantApiKey(raw) };
}

/** Membership decides the company. A body tenant id or hash is ignored. */
export function tenantForKeyIssue(
  membershipTenantId: string | null | undefined,
  _body?: unknown
): string | null {
  const id = typeof membershipTenantId === "string" ? membershipTenantId.trim() : "";
  return id || null;
}

/** Hash and prefix come from the minted key. A body hash is ignored. */
export function issuedKeyRecord(
  created: { hash: string; prefix: string },
  _body?: unknown
): { api_key_hash: string; api_key_prefix: string } {
  return { api_key_hash: created.hash, api_key_prefix: created.prefix };
}

export type IssueKeyResult =
  | { ok: true; raw: string; prefix: string; tenantId: string; companyName: string | null }
  | { ok: false; status: 404 | 500 | 503; error: string };

/** Stores the hash and prefix. The raw key is returned once and is not written. */
export async function issueTenantApiKey(tenantId: string, body?: unknown): Promise<IssueKeyResult> {
  const id = tenantForKeyIssue(tenantId, body);
  if (!id) return { ok: false, status: 404, error: "Company not found" };
  const supabase = serviceRoleClient();
  if (!supabase) return { ok: false, status: 503, error: "Supabase not configured" };
  const created = createTenantApiKey();
  const { data, error } = await supabase
    .from("tenants")
    .update(issuedKeyRecord(created, body))
    .eq("id", id)
    .select("id, company_name")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data?.id) return { ok: false, status: 404, error: "Company not found" };
  return {
    ok: true,
    raw: created.raw,
    prefix: created.prefix,
    tenantId: String(data.id),
    companyName: typeof data.company_name === "string" ? data.company_name : null,
  };
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
