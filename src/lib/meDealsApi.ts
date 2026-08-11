import { apiAuthHeaders, API_BASE } from "./api";

async function meFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { ...apiAuthHeaders(false) },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data;
}

export type DealTimelineRun = {
  id: string;
  created_at: string;
  client_name: string;
  deal_value: number;
  deal_status: string;
  headline: string;
  lifecycle_phase: string;
  lifecycle_label: string;
  deal_risk_index: number | null;
  risk_tier: string | null;
  viability_score: number | null;
  viability_state: string | null;
  trajectory_type: string | null;
  core_blocker: string | null;
  account_id: string | null;
  since_previous: {
    direction: "improved" | "worsened" | "flat" | "unknown";
    summary: string;
    viability_delta: number | null;
    risk_delta: number | null;
    phase_delta: number;
  } | null;
};

export type DealThread = {
  thread_key: string;
  client_name: string;
  deal_value: number;
  run_count: number;
  latest_run_id: string;
  latest_at: string;
  first_at: string;
  lifecycle_phase: string;
  lifecycle_label: string;
  deal_status: string;
  deal_risk_index: number | null;
  viability_score: number | null;
  risk_tier: string | null;
  core_blocker: string | null;
  headline: string;
  account_id: string | null;
  crm: {
    provider: "hubspot" | "salesforce" | null;
    external_deal_id: string | null;
    last_inbound_at?: string | null;
    last_outbound_at?: string | null;
    linked: boolean;
  };
  improvement: {
    direction: "improved" | "worsened" | "flat" | "unknown";
    summary: string;
    viability_delta: number | null;
    risk_delta: number | null;
    phase_delta: number;
  } | null;
  timeline: DealTimelineRun[];
};

export type MeDealsResponse = {
  summary: {
    deal_threads: number;
    total_runs: number;
    crm_linked: number;
    stalled: number;
    unstuck_or_active: number;
    improved: number;
  };
  threads: DealThread[];
};

export async function fetchMyDeals(): Promise<MeDealsResponse> {
  return meFetch<MeDealsResponse>("/api/me/deals");
}

export async function fetchMyDeal(id: string) {
  return meFetch<{
    id: string;
    created_at: string;
    client_name: string;
    deal_value: number;
    deal_status: string;
    stall_cause: string;
    ingest_metadata: unknown;
    deal_memory_summary: unknown;
    crm: {
      provider: string;
      external_deal_id: string;
      account_id: string | null;
      last_inbound_at: string | null;
      last_outbound_at: string | null;
    } | null;
    analysis: Record<string, unknown>;
  }>(`/api/me/deals/${encodeURIComponent(id)}`);
}
