import { apiAuthHeaders, API_BASE } from "./api";
import type { BillingMe } from "./billing";

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

export type VendorDashboard = {
  id: string;
  label: string;
  href: string;
  why: string;
  extra?: Array<{ label: string; href: string }>;
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
    deploy: {
      git_sha: string | null;
      git_branch: string | null;
      boot_time: string;
      render_service: string | null;
      hotfix: string;
    };
    runtime: {
      analyses_paused: boolean;
      pause_message: string;
      daily_analysis_cap: number | null;
      updated_at: string | null;
    };
    spend: {
      guest_cap: number;
      guest_daily_limit: number;
      global_daily_cap: number | null;
      analyses_today: number;
      gemini_model: string;
      llm_fails_at_zero: string;
    };
    restore: {
      last_snapshot: {
        id: string;
        created_at: string;
        counts: Record<string, number | null>;
        note: string | null;
      } | null;
      runbook: string[];
    };
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
    vendor_dashboards: VendorDashboard[];
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
    billing: BillingMe | null;
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

export type FounderApisInventory = {
  checked_at: string;
  headline: string;
  status: "ok" | "warning" | "critical";
  outages: Array<{
    id: string;
    label: string;
    status: string;
    meaning: string;
    billing: { level: string; detail: string; metric_label?: string; metric_value?: string | number | null };
  }>;
  providers: Array<{
    id: string;
    label: string;
    category: string;
    status: "ok" | "out" | "degraded" | "not_configured" | "unknown";
    configured: boolean;
    meaning: string;
    billing: {
      level: "ok" | "watch" | "pay_soon" | "exhausted" | "unknown";
      detail: string;
      metric_label?: string;
      metric_value?: string | number | null;
    };
    last_error_at: string | null;
    last_error_code: string | null;
    error_count_7d: number;
    probe: string;
    dashboard_url?: string | null;
  }>;
  category_shift: Array<{
    category: string;
    current_7d: number;
    prior_7d: number;
    delta: number;
    changed: boolean;
  }>;
  category_changed: boolean;
  usage: {
    range: string;
    series: { day: string; total: number; errors: number; quota_errors: number }[];
    analyses_7d: number;
    analyses_prior_7d: number;
    events_7d: number;
    errors_7d: number;
    quota_errors_7d: number;
    quota_errors_prior_7d: number;
  };
  billing_alerts: Array<{
    id: string;
    severity: "info" | "warning" | "critical";
    title: string;
    detail: string;
    action: string;
  }>;
  vendor_dashboards: VendorDashboard[];
};

export async function fetchFounderApis(): Promise<FounderApisInventory> {
  return founderFetch<FounderApisInventory>("/api/founder/apis");
}

export async function fetchFounderCrashes() {
  return founderFetch<{
    crashes: Array<{
      id: string;
      created_at: string;
      message: string;
      stack: string | null;
      page_url: string | null;
      user_agent: string | null;
      release_sha: string | null;
      user_email: string | null;
      diagnosis_packet: string;
    }>;
  }>("/api/founder/crashes");
}

export async function founderSetKillSwitch(analysesPaused: boolean, pauseMessage?: string) {
  return founderFetch<{
    ok: boolean;
    runtime: {
      analyses_paused: boolean;
      pause_message: string;
      daily_analysis_cap: number | null;
    };
  }>("/api/founder/kill-switch", {
    method: "POST",
    body: JSON.stringify({
      analyses_paused: analysesPaused,
      ...(pauseMessage !== undefined ? { pause_message: pauseMessage } : {}),
    }),
  });
}

export async function founderSetSpendCap(dailyAnalysisCap: number | null) {
  return founderFetch<{
    ok: boolean;
    runtime: { daily_analysis_cap: number | null };
  }>("/api/founder/spend-cap", {
    method: "POST",
    body: JSON.stringify({ daily_analysis_cap: dailyAnalysisCap }),
  });
}

export async function founderRestoreSnapshot(note?: string) {
  return founderFetch<{
    ok: boolean;
    snapshot: {
      id: string;
      created_at: string;
      counts: Record<string, number | null>;
      note: string | null;
    };
  }>("/api/founder/restore-snapshot", {
    method: "POST",
    body: JSON.stringify({ note: note ?? "Pre-restore drill snapshot" }),
  });
}

export type ContactInquiry = {
  id: string;
  created_at: string;
  topic: string;
  name: string;
  email: string;
  message: string;
};

export async function fetchFounderContactInquiries(): Promise<{ inquiries: ContactInquiry[] }> {
  return founderFetch<{ inquiries: ContactInquiry[] }>("/api/founder/contact-inquiries");
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}
