import { isZoomConfigured } from "./integrations/zoom/config.js";
import { loadZoomTokens } from "./integrations/zoom/tokens.js";
import { isGoogleMeetConfigured } from "./integrations/google/config.js";
import { loadGoogleTokens } from "./integrations/google/tokens.js";
import { isTeamsConfigured } from "./integrations/teams/config.js";
import { loadTeamsTokens } from "./integrations/teams/tokens.js";
import { isHubSpotConfigured } from "./integrations/hubspot/config.js";
import { loadHubSpotTokens } from "./integrations/hubspot/tokens.js";
import { isSalesforceConfigured } from "./integrations/salesforce/config.js";
import { loadSalesforceTokens } from "./integrations/salesforce/tokens.js";
import { serviceRoleClient } from "./founderAuth.js";

const bootTime = new Date().toISOString();

export type SystemStatus = {
  status: "ok" | "warning" | "critical";
  checked_at: string;
  deploy: {
    git_sha: string | null;
    boot_time: string;
  };
  integrations: Array<{
    id: string;
    label: string;
    configured: boolean;
    token_present: boolean | null;
    ok: boolean;
    meaning: string;
  }>;
  keys: {
    gemini: boolean;
    gemini_key_format_valid: boolean;
    assemblyai: boolean;
    supabase: boolean;
  };
  last_purge: {
    created_at: string;
    rows_affected: number;
    retention_days: number;
  } | null;
};

export async function buildSystemStatus(): Promise<SystemStatus> {
  const geminiKey = (process.env.GEMINI_API_KEY ?? "").trim();
  const geminiKeyValid = /^AIza/.test(geminiKey) || /^AQ\./.test(geminiKey);

  const integrations: SystemStatus["integrations"] = [
    {
      id: "gemini",
      label: "Gemini (analysis)",
      configured: !!geminiKey,
      token_present: null,
      ok: !!geminiKey && geminiKeyValid,
      meaning: !geminiKey
        ? "GEMINI_API_KEY missing — analyses will fail."
        : !geminiKeyValid
          ? "GEMINI_API_KEY format looks wrong — create a new key in AI Studio."
          : "Analysis engine key present.",
    },
    {
      id: "assemblyai",
      label: "AssemblyAI (audio)",
      configured: !!process.env.ASSEMBLYAI_API_KEY?.trim(),
      token_present: null,
      ok: !!process.env.ASSEMBLYAI_API_KEY?.trim(),
      meaning: process.env.ASSEMBLYAI_API_KEY?.trim()
        ? "Audio transcription available."
        : "Audio upload needs ASSEMBLYAI_API_KEY (paste transcript still works).",
    },
    {
      id: "supabase",
      label: "Supabase",
      configured: !!process.env.SUPABASE_URL?.trim(),
      token_present: null,
      ok: !!(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
      meaning:
        process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
          ? "Database + Auth admin configured."
          : "Supabase URL or service role missing — saves and ops HQ will be limited.",
    },
    {
      id: "hubspot",
      label: "HubSpot",
      configured: isHubSpotConfigured(),
      token_present: isHubSpotConfigured() ? !!loadHubSpotTokens()?.access_token : null,
      ok: !isHubSpotConfigured() || !!loadHubSpotTokens()?.access_token,
      meaning: !isHubSpotConfigured()
        ? "HubSpot OAuth not configured (optional)."
        : loadHubSpotTokens()?.access_token
          ? "HubSpot connected (global token on disk)."
          : "HubSpot configured but no token — reconnect OAuth.",
    },
    {
      id: "salesforce",
      label: "Salesforce",
      configured: isSalesforceConfigured(),
      token_present: isSalesforceConfigured() ? !!loadSalesforceTokens()?.access_token : null,
      ok: !isSalesforceConfigured() || !!loadSalesforceTokens()?.access_token,
      meaning: !isSalesforceConfigured()
        ? "Salesforce OAuth not configured (optional)."
        : loadSalesforceTokens()?.access_token
          ? "Salesforce connected (global token on disk)."
          : "Salesforce configured but no token — reconnect OAuth.",
    },
    {
      id: "zoom",
      label: "Zoom RTMS",
      configured: isZoomConfigured(),
      token_present: isZoomConfigured() ? !!loadZoomTokens()?.access_token : null,
      ok: true,
      meaning: isZoomConfigured()
        ? loadZoomTokens()?.access_token
          ? "Zoom credentials + token present."
          : "Zoom app credentials present (token optional for webhooks)."
        : "Zoom not configured (optional).",
    },
    {
      id: "google_meet",
      label: "Google Meet / Gmail",
      configured: isGoogleMeetConfigured(),
      token_present: isGoogleMeetConfigured() ? !!loadGoogleTokens()?.access_token : null,
      ok: !isGoogleMeetConfigured() || !!loadGoogleTokens()?.access_token,
      meaning: !isGoogleMeetConfigured()
        ? "Google OAuth not configured (optional)."
        : loadGoogleTokens()?.access_token
          ? "Google connected (global token on disk)."
          : "Google configured but no token — reconnect OAuth.",
    },
    {
      id: "teams",
      label: "Microsoft Teams / Outlook",
      configured: isTeamsConfigured(),
      token_present: isTeamsConfigured() ? !!loadTeamsTokens()?.access_token : null,
      ok: !isTeamsConfigured() || !!loadTeamsTokens()?.access_token,
      meaning: !isTeamsConfigured()
        ? "Teams OAuth not configured (optional)."
        : loadTeamsTokens()?.access_token
          ? "Teams connected (global token on disk)."
          : "Teams configured but no token — reconnect OAuth.",
    },
  ];

  // Zoom ok: configured alone is fine (webhook-based); don't require token file
  const zoom = integrations.find((i) => i.id === "zoom");
  if (zoom) zoom.ok = true;

  let lastPurge: SystemStatus["last_purge"] = null;
  const supabase = serviceRoleClient();
  if (supabase) {
    const { data } = await supabase
      .from("purge_audit_log")
      .select("created_at, rows_affected, retention_days")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) {
      lastPurge = {
        created_at: data.created_at,
        rows_affected: data.rows_affected,
        retention_days: data.retention_days,
      };
    }
  }

  const keys = {
    gemini: !!geminiKey,
    gemini_key_format_valid: geminiKeyValid,
    assemblyai: !!process.env.ASSEMBLYAI_API_KEY?.trim(),
    supabase: !!(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
  };

  const criticalFail =
    !keys.gemini || !keys.gemini_key_format_valid || !keys.supabase;
  const warningFail = integrations.some(
    (i) => i.configured && i.token_present === false && i.id !== "zoom"
  );

  const status: SystemStatus["status"] = criticalFail
    ? "critical"
    : warningFail
      ? "warning"
      : "ok";

  return {
    status,
    checked_at: new Date().toISOString(),
    deploy: {
      git_sha:
        (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? process.env.COMMIT_SHA ?? "")
          .trim()
          .slice(0, 12) || null,
      boot_time: bootTime,
    },
    integrations,
    keys,
    last_purge: lastPurge,
  };
}

export function classifyIssue(route: string, statusCode: number, errorCode: string | null): {
  category: "AI" | "Auth" | "CRM" | "Quota" | "Network" | "Other";
  likely_fix: string;
} {
  const err = (errorCode ?? "").toLowerCase();
  const r = route.toLowerCase();

  if (statusCode === 402 || err.includes("payment_required")) {
    return {
      category: "Other",
      likely_fix: "Customer hit the paid gate — check their plan on Lookup / Stripe.",
    };
  }
  if (statusCode === 429 || err.includes("quota") || err.includes("429")) {
    return {
      category: "Quota",
      likely_fix: "Gemini/API quota — wait a few minutes or switch GEMINI_MODEL; check AI Studio quotas.",
    };
  }
  if (
    err.includes("401") ||
    err.includes("api key") ||
    err.includes("gemini_api_key") ||
    (!err && r.includes("post-mortem") && statusCode === 500)
  ) {
    if (err.includes("gemini") || err.includes("api key") || err.includes("401")) {
      return {
        category: "AI",
        likely_fix: "Check GEMINI_API_KEY on Render; create a fresh AI Studio key if rejected.",
      };
    }
  }
  if (r.includes("/auth") || statusCode === 401) {
    return {
      category: "Auth",
      likely_fix: "Auth/session issue — confirm Supabase Auth URL config and user login path.",
    };
  }
  if (r.includes("hubspot") || r.includes("salesforce") || err.includes("token")) {
    return {
      category: "CRM",
      likely_fix: "CRM OAuth token missing or expired — reconnect HubSpot/Salesforce in the product.",
    };
  }
  if (err.includes("fetch failed") || err.includes("tls") || err.includes("network") || statusCode === 502) {
    return {
      category: "Network",
      likely_fix: "Outbound HTTPS/TLS failure — check Render egress and Windows CA notes if local.",
    };
  }
  if (r.includes("post-mortem") || r.includes("live-triage") || r.includes("live-objection")) {
    return {
      category: "AI",
      likely_fix: "Analysis path failed — open the diagnosis packet and check Gemini + recent deploy.",
    };
  }
  return {
    category: "Other",
    likely_fix: "Inspect route + error_code in the diagnosis packet; search Render logs by request_id.",
  };
}
