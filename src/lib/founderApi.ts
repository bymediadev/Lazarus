import { apiAuthHeaders, API_BASE } from "./api";

async function founderFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...apiAuthHeaders(init?.body != null),
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  }
  return data;
}

export type FounderMe = {
  founder: boolean;
  ops: boolean;
  email: string | null;
  user_id: string;
  role: string | null;
};

export async function fetchFounderMe(): Promise<FounderMe> {
  return founderFetch<FounderMe>("/api/founder/me");
}

export async function fetchFounderOverview() {
  return founderFetch<{
    status: "ok" | "warning" | "critical";
    system_status: string;
    stats: {
      analyses_24h: number;
      analyses_7d: number;
      errors_24h: number;
      events_24h: number;
      avg_latency_ms: number | null;
      p95_latency_ms: number | null;
    };
    peak_hours: { hour: string; count: number }[];
    hangups: Array<{
      id: string;
      created_at: string;
      route: string;
      method: string;
      status_code: number;
      error_code: string | null;
      request_id: string;
      user_email: string | null;
      category: string;
      likely_fix: string;
    }>;
    last_alert: { issue_key: string; severity: string; last_sent_at: string } | null;
    deploy: { git_sha: string | null; boot_time: string };
    checked_at: string;
  }>("/api/founder/overview");
}

export async function fetchFounderSystem() {
  return founderFetch<{
    status: "ok" | "warning" | "critical";
    checked_at: string;
    deploy: { git_sha: string | null; boot_time: string };
    integrations: Array<{
      id: string;
      label: string;
      configured: boolean;
      token_present: boolean | null;
      ok: boolean;
      meaning: string;
    }>;
    keys: Record<string, boolean>;
    last_purge: {
      created_at: string;
      rows_affected: number;
      retention_days: number;
    } | null;
  }>("/api/founder/system");
}

export async function fetchFounderIssues() {
  return founderFetch<{
    issues: Array<{
      id: string;
      created_at: string;
      route: string;
      method: string;
      status_code: number;
      duration_ms: number | null;
      error_code: string | null;
      request_id: string;
      user_id: string | null;
      user_email: string | null;
      category: string;
      likely_fix: string;
      diagnosis_packet: string;
    }>;
  }>("/api/founder/issues");
}

export async function founderLookup(email: string) {
  return founderFetch<{
    user: {
      id: string;
      email: string;
      created_at: string;
      last_sign_in_at: string | null;
      login_provider: string | null;
      role: string | null;
    };
    note: string;
    note_updated_at: string | null;
    deals: Array<{
      id: string;
      client_name: string;
      deal_value: number;
      deal_status: string;
      stall_cause: string;
      created_at: string;
    }>;
    issues: Array<{
      id: string;
      created_at: string;
      route: string;
      status_code: number;
      error_code: string | null;
      request_id: string;
      category: string;
      likely_fix: string;
      diagnosis_packet: string;
    }>;
    crm_links: Array<{
      id: string;
      provider: string;
      external_deal_id: string;
      post_mortem_id: string | null;
      updated_at: string;
    }>;
  }>(`/api/founder/lookup?email=${encodeURIComponent(email)}`);
}

export async function founderDeleteDeal(userId: string, dealId: string) {
  return founderFetch<{ ok: boolean }>(`/api/founder/users/${userId}/deals/${dealId}`, {
    method: "DELETE",
  });
}

export async function founderPasswordReset(userId: string) {
  return founderFetch<{ ok: boolean; email: string }>(
    `/api/founder/users/${userId}/password-reset`,
    { method: "POST", body: "{}" }
  );
}

export async function founderSaveNote(userId: string, note: string) {
  return founderFetch<{ ok: boolean }>(`/api/founder/users/${userId}/note`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export async function founderTestDigest(slot = "afternoon") {
  return founderFetch<{ ok: boolean; sent: boolean; detail: string; severity: string }>(
    "/api/founder/alerts/test-digest",
    { method: "POST", body: JSON.stringify({ slot }) }
  );
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
