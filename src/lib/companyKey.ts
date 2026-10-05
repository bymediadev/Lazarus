import { API_BASE, apiAuthHeaders } from "./api";

export type IssuedCompanyKey = {
  rawKey: string;
  prefix: string;
  message: string;
};

export async function generateCompanyApiKey(): Promise<IssuedCompanyKey> {
  const res = await fetch(`${API_BASE}/api/tenant/generate-key`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: "{}",
  });
  const data = (await res.json().catch(() => ({}))) as IssuedCompanyKey & { error?: string };
  if (!res.ok || !data.rawKey) {
    throw new Error(data.error || "Could not create a company key");
  }
  return { rawKey: data.rawKey, prefix: data.prefix, message: data.message };
}
