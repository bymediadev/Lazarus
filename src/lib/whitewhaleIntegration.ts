import { API_BASE, apiAuthHeaders } from "./api";
import type { WhiteWhaleAccountIntel } from "../../shared/whitewhaleTypes";

export type { WhiteWhaleAccountIntel };

export interface WhiteWhaleProviderStatus {
  configured: boolean;
  ok?: boolean;
  credits_remaining?: number | null;
  active_accounts?: number | null;
  icps?: string[];
  note: string;
  error?: string;
}

export interface WhiteWhaleLookupResult {
  ok: boolean;
  found: boolean;
  domain: string;
  intel: WhiteWhaleAccountIntel | null;
  note?: string;
  error?: string;
}

export interface WhiteWhaleMonitorResult {
  ok: boolean;
  domain: string;
  activated: boolean;
  found: boolean;
  intel: WhiteWhaleAccountIntel | null;
  note?: string;
  error?: string;
}

export async function fetchWhiteWhaleStatus(): Promise<WhiteWhaleProviderStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/whitewhale/status`);
  if (!res.ok) throw new Error(`WhiteWhale status failed (${res.status})`);
  return res.json() as Promise<WhiteWhaleProviderStatus>;
}

export async function lookupWhiteWhaleAccount(domain: string): Promise<WhiteWhaleLookupResult> {
  const res = await fetch(`${API_BASE}/api/integrations/whitewhale/lookup`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ domain: domain.trim() }),
  });
  const data = (await res.json()) as WhiteWhaleLookupResult;
  if (!res.ok) throw new Error(data.error ?? `WhiteWhale lookup failed (${res.status})`);
  return data;
}

export async function monitorWhiteWhaleAccount(
  domain: string,
  opts?: { activate?: boolean; icp?: string }
): Promise<WhiteWhaleMonitorResult> {
  const res = await fetch(`${API_BASE}/api/integrations/whitewhale/monitor`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({
      domain: domain.trim(),
      activate: opts?.activate ?? false,
      ...(opts?.icp ? { icp: opts.icp } : {}),
    }),
  });
  const data = (await res.json()) as WhiteWhaleMonitorResult;
  if (!res.ok) throw new Error(data.error ?? `WhiteWhale monitor failed (${res.status})`);
  return data;
}
