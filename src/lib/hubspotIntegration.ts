import { API_BASE, apiAuthHeaders } from "./api";
import type { HistoricalCrmContextEntry } from "../types";

export interface HubSpotProviderStatus {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  hub_domain: string | null;
  connected_at: string | null;
  scopes?: string;
  note: string;
}

export interface HubSpotDealHit {
  id: string;
  dealname: string;
  dealstage: string;
  amount: string | null;
  closedate: string | null;
  createdate: string | null;
}

export interface HubSpotDealSearchResult {
  ok: boolean;
  provider: "hubspot";
  query: string;
  count: number;
  deals: HubSpotDealHit[];
}

export interface HubSpotDealImportResult {
  ok: boolean;
  provider: "hubspot";
  deal: HubSpotDealHit;
  note_count: number;
  account_id: string;
  sales_cycle_days: number;
  historical_crm_context: HistoricalCrmContextEntry[];
  source: string;
}

export async function fetchHubSpotStatus(): Promise<HubSpotProviderStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/hubspot/status`, {
    headers: apiAuthHeaders(),
  });
  if (!res.ok) throw new Error(`HubSpot status failed (${res.status})`);
  return res.json() as Promise<HubSpotProviderStatus>;
}

export function hubspotConnectUrl(): string {
  return `${API_BASE}/api/integrations/hubspot/connect`;
}

export async function disconnectHubSpot(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/hubspot/disconnect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Disconnect failed (${res.status})`);
  }
}

export async function searchHubSpotDeals(query: string): Promise<HubSpotDealSearchResult> {
  const res = await fetch(`${API_BASE}/api/integrations/hubspot/search-deals`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ query: query.trim() }),
  });
  const data = (await res.json()) as HubSpotDealSearchResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HubSpot deal search failed (${res.status})`);
  return data;
}

export async function importHubSpotDealNotes(dealId: string): Promise<HubSpotDealImportResult> {
  const res = await fetch(`${API_BASE}/api/integrations/hubspot/import-deal-notes`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ dealId }),
  });
  const data = (await res.json()) as HubSpotDealImportResult & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `HubSpot import failed (${res.status})`);
  return data;
}

export async function pushHubSpotNote(
  dealId: string,
  noteBody: string,
  postMortemId?: string | null
): Promise<{ ok: boolean; note_id: string }> {
  const res = await fetch(`${API_BASE}/api/integrations/hubspot/push-note`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({
      dealId,
      noteBody,
      ...(postMortemId ? { postMortemId } : {}),
    }),
  });
  const data = (await res.json()) as { ok?: boolean; note_id?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `HubSpot push failed (${res.status})`);
  return { ok: true, note_id: data.note_id ?? "" };
}
