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
  wiped?: boolean;
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

export async function reviveHubSpotDeal(input: {
  dealId: string;
  viability: number;
  status: string;
  nextAction: string;
  noteBody: string;
  postMortemId?: string | null;
}): Promise<{ nextStep: string | null; nextStepError?: string }> {
  const res = await fetch(`${API_BASE}/api/integrations/hubspot/revive`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({
      dealId: input.dealId,
      viability: input.viability,
      status: input.status,
      nextAction: input.nextAction,
      noteBody: input.noteBody,
      ...(input.postMortemId ? { postMortemId: input.postMortemId } : {}),
    }),
  });
  const data = (await res.json()) as {
    error?: string;
    next_step?: string | null;
    next_step_error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `HubSpot revive failed (${res.status})`);
  return { nextStep: data.next_step ?? null, nextStepError: data.next_step_error };
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
