import { API_BASE, apiAuthHeaders } from "./api";
import type { HistoricalCrmContextEntry } from "../types";

export interface SalesforceProviderStatus {
  configured: boolean;
  connected: boolean;
  account_email: string | null;
  instance_url: string | null;
  connected_at: string | null;
  scopes?: string;
  note: string;
}

export interface SalesforceOppHit {
  id: string;
  name: string;
  stageName: string;
  amount: number | null;
  closeDate: string | null;
}

export async function fetchSalesforceStatus(): Promise<SalesforceProviderStatus> {
  const res = await fetch(`${API_BASE}/api/integrations/salesforce/status`, {
    headers: apiAuthHeaders(),
  });
  if (!res.ok) throw new Error(`Salesforce status failed (${res.status})`);
  return res.json() as Promise<SalesforceProviderStatus>;
}

export function salesforceConnectUrl(): string {
  return `${API_BASE}/api/integrations/salesforce/connect`;
}

export async function disconnectSalesforce(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/salesforce/disconnect`, {
    method: "POST",
    headers: apiAuthHeaders(true),
  });
  if (!res.ok) {
    const data = (await res.json()) as { error?: string };
    throw new Error(data.error ?? `Disconnect failed (${res.status})`);
  }
}

export async function searchSalesforceOpportunities(
  query: string
): Promise<{ query: string; opportunities: SalesforceOppHit[] }> {
  const res = await fetch(`${API_BASE}/api/integrations/salesforce/search-opportunities`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ query: query.trim() }),
  });
  const data = (await res.json()) as {
    query?: string;
    opportunities?: SalesforceOppHit[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Salesforce search failed (${res.status})`);
  return { query: data.query ?? query, opportunities: data.opportunities ?? [] };
}

export async function importSalesforceOpportunity(opportunityId: string): Promise<{
  account_id: string;
  sales_cycle_days: number;
  historical_crm_context: HistoricalCrmContextEntry[];
  deal_id: string;
  note_count: number;
  opportunity: SalesforceOppHit;
  wiped?: boolean;
}> {
  const res = await fetch(`${API_BASE}/api/integrations/salesforce/import-opportunity`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ opportunityId }),
  });
  const data = (await res.json()) as {
    account_id?: string;
    sales_cycle_days?: number;
    historical_crm_context?: HistoricalCrmContextEntry[];
    deal_id?: string;
    note_count?: number;
    opportunity?: SalesforceOppHit;
    wiped?: boolean;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `Salesforce import failed (${res.status})`);
  return {
    account_id: data.account_id ?? "",
    sales_cycle_days: data.sales_cycle_days ?? 90,
    historical_crm_context: data.historical_crm_context ?? [],
    deal_id: data.deal_id ?? opportunityId,
    note_count: data.note_count ?? 0,
    opportunity: data.opportunity!,
    wiped: data.wiped === true,
  };
}

export async function reviveSalesforceOpportunity(input: {
  opportunityId: string;
  viability: number;
  status: string;
  nextAction: string;
  noteBody: string;
  postMortemId?: string | null;
}): Promise<{ nextStep: string | null; nextStepError?: string }> {
  const res = await fetch(`${API_BASE}/api/integrations/salesforce/revive`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({
      opportunityId: input.opportunityId,
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
  if (!res.ok) throw new Error(data.error ?? `Salesforce revive failed (${res.status})`);
  return { nextStep: data.next_step ?? null, nextStepError: data.next_step_error };
}

export async function pushSalesforceNote(
  opportunityId: string,
  noteBody: string,
  postMortemId?: string | null
): Promise<void> {
  const res = await fetch(`${API_BASE}/api/integrations/salesforce/push-note`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({
      opportunityId,
      noteBody,
      ...(postMortemId ? { postMortemId } : {}),
    }),
  });
  const data = (await res.json()) as { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Salesforce push failed (${res.status})`);
}
