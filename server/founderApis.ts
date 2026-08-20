import { secureFetch } from "./secureFetch.js";
import { classifyIssue, buildSystemStatus } from "./founderSystem.js";
import { serviceRoleClient } from "./founderAuth.js";
import { isWhiteWhaleConfigured } from "./integrations/whitewhale/config.js";
import { getWhiteWhaleUserOverview } from "./integrations/whitewhale/client.js";

export type ApiProviderHealth = {
  id: string;
  label: string;
  category: "AI" | "Auth" | "CRM" | "Signals" | "Audio" | "Database" | "Email" | "Other";
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
  probe: "config" | "live" | "events";
};

export type CategoryBucket = {
  category: string;
  current_7d: number;
  prior_7d: number;
  delta: number;
  changed: boolean;
};

export type ApisInventory = {
  checked_at: string;
  headline: string;
  status: "ok" | "warning" | "critical";
  outages: ApiProviderHealth[];
  providers: ApiProviderHealth[];
  category_shift: CategoryBucket[];
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
};

type EventRow = {
  created_at: string;
  route: string;
  status_code: number;
  error_code: string | null;
};

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("probe timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function probeGemini(): Promise<{
  status: ApiProviderHealth["status"];
  meaning: string;
  billing: ApiProviderHealth["billing"];
}> {
  const key = (process.env.GEMINI_API_KEY ?? "").trim();
  if (!key) {
    return {
      status: "not_configured",
      meaning: "GEMINI_API_KEY missing — analyses will fail.",
      billing: { level: "unknown", detail: "No key to meter." },
    };
  }
  const formatOk = /^AIza/.test(key) || /^AQ\./.test(key);
  if (!formatOk) {
    return {
      status: "out",
      meaning: "GEMINI_API_KEY format looks wrong.",
      billing: { level: "unknown", detail: "Fix key before checking quota." },
    };
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}&pageSize=1`;
    const res = await withTimeout(secureFetch(url, { method: "GET" }), 8000);
    if (res.status === 429) {
      return {
        status: "degraded",
        meaning: "Gemini returned 429 — quota or rate limit hit.",
        billing: {
          level: "exhausted",
          detail: "At or over free/paid quota right now.",
          metric_label: "probe",
          metric_value: "429",
        },
      };
    }
    if (res.status === 401 || res.status === 403) {
      return {
        status: "out",
        meaning: `Gemini key rejected (${res.status}). Create a fresh AI Studio key.`,
        billing: {
          level: "pay_soon",
          detail: "Key invalid — often billing not enabled or key revoked.",
        },
      };
    }
    if (!res.ok) {
      return {
        status: "degraded",
        meaning: `Gemini probe HTTP ${res.status}.`,
        billing: { level: "watch", detail: "Unexpected probe response — check AI Studio." },
      };
    }
    return {
      status: "ok",
      meaning: "Gemini reachable (models list OK).",
      billing: {
        level: "ok",
        detail: "Live probe OK. Watch quota errors in usage if volume spikes.",
      },
    };
  } catch (err) {
    return {
      status: "degraded",
      meaning: err instanceof Error ? err.message : "Gemini probe failed",
      billing: { level: "unknown", detail: "Could not reach Google from this host." },
    };
  }
}

async function probeAssemblyAI(): Promise<{
  status: ApiProviderHealth["status"];
  meaning: string;
  billing: ApiProviderHealth["billing"];
}> {
  const key = (process.env.ASSEMBLYAI_API_KEY ?? "").trim();
  if (!key) {
    return {
      status: "not_configured",
      meaning: "ASSEMBLYAI_API_KEY missing — paste transcript still works.",
      billing: { level: "ok", detail: "Optional; not required for text analyses." },
    };
  }
  try {
    const res = await withTimeout(
      secureFetch("https://api.assemblyai.com/v2/transcript", {
        method: "GET",
        headers: { Authorization: key },
      }),
      8000
    );
    if (res.status === 401 || res.status === 403) {
      return {
        status: "out",
        meaning: "AssemblyAI key rejected.",
        billing: { level: "pay_soon", detail: "Key invalid or account closed — renew in AssemblyAI." },
      };
    }
    if (res.status === 429) {
      return {
        status: "degraded",
        meaning: "AssemblyAI rate/quota limited.",
        billing: { level: "exhausted", detail: "At usage limit — upgrade plan or wait." },
      };
    }
    // 200 list or 405/400 on GET is still "auth worked"
    if (res.ok || res.status === 400 || res.status === 405) {
      return {
        status: "ok",
        meaning: "AssemblyAI reachable.",
        billing: { level: "ok", detail: "Key accepted. Check AssemblyAI dashboard for remaining minutes." },
      };
    }
    return {
      status: "degraded",
      meaning: `AssemblyAI HTTP ${res.status}.`,
      billing: { level: "watch", detail: "Unexpected response — check dashboard." },
    };
  } catch (err) {
    return {
      status: "degraded",
      meaning: err instanceof Error ? err.message : "AssemblyAI probe failed",
      billing: { level: "unknown", detail: "Could not reach AssemblyAI." },
    };
  }
}

async function probeWhiteWhale(): Promise<{
  status: ApiProviderHealth["status"];
  meaning: string;
  billing: ApiProviderHealth["billing"];
}> {
  if (!isWhiteWhaleConfigured()) {
    return {
      status: "not_configured",
      meaning: "WhiteWhale not configured (optional signals).",
      billing: { level: "ok", detail: "No credits consumed until configured." },
    };
  }
  try {
    const overview = (await withTimeout(getWhiteWhaleUserOverview(), 10000)) as {
      credits_remaining?: number;
      active_accounts?: number;
    };
    const credits =
      typeof overview?.credits_remaining === "number" ? overview.credits_remaining : null;
    const active =
      typeof overview?.active_accounts === "number" ? overview.active_accounts : null;

    let billing: ApiProviderHealth["billing"];
    if (credits === null) {
      billing = {
        level: "unknown",
        detail: "Connected but credits_remaining not returned.",
        metric_label: "active_accounts",
        metric_value: active,
      };
    } else if (credits <= 0) {
      billing = {
        level: "exhausted",
        detail: "No WhiteWhale credits left — Why Now lookups will fail.",
        metric_label: "credits_remaining",
        metric_value: credits,
      };
    } else if (credits <= 20) {
      billing = {
        level: "pay_soon",
        detail: "Low WhiteWhale credits — top up soon.",
        metric_label: "credits_remaining",
        metric_value: credits,
      };
    } else if (credits <= 50) {
      billing = {
        level: "watch",
        detail: "Credits getting low.",
        metric_label: "credits_remaining",
        metric_value: credits,
      };
    } else {
      billing = {
        level: "ok",
        detail: "Credits available.",
        metric_label: "credits_remaining",
        metric_value: credits,
      };
    }

    const status: ApiProviderHealth["status"] =
      billing.level === "exhausted" ? "degraded" : "ok";

    return {
      status,
      meaning:
        credits != null
          ? `WhiteWhale connected · ${credits} credits · ${active ?? "—"} active accounts.`
          : "WhiteWhale connected.",
      billing,
    };
  } catch (err) {
    return {
      status: "out",
      meaning: err instanceof Error ? err.message : "WhiteWhale probe failed",
      billing: { level: "unknown", detail: "API key or user email may be invalid." },
    };
  }
}

function emptyCategories(): Record<string, number> {
  return { AI: 0, Auth: 0, CRM: 0, Quota: 0, Network: 0, Other: 0 };
}

function tallyCategories(rows: EventRow[]): Record<string, number> {
  const out = emptyCategories();
  for (const row of rows) {
    const { category } = classifyIssue(row.route, row.status_code, row.error_code);
    out[category] = (out[category] ?? 0) + 1;
  }
  return out;
}

function providerFromRoute(route: string): string | null {
  const r = route.toLowerCase();
  if (r.includes("whitewhale")) return "whitewhale";
  if (r.includes("hubspot")) return "hubspot";
  if (r.includes("salesforce")) return "salesforce";
  if (r.includes("auth")) return "supabase";
  if (r.includes("post-mortem") || r.includes("live-triage") || r.includes("live-objection") || r.includes("guide"))
    return "gemini";
  if (r.includes("audio") || r.includes("transcript") || r.includes("assembly")) return "assemblyai";
  return null;
}

function isQuotaEvent(row: EventRow): boolean {
  return classifyIssue(row.route, row.status_code, row.error_code).category === "Quota";
}

export async function buildApisInventory(): Promise<ApisInventory> {
  const system = await buildSystemStatus();
  const now = Date.now();
  const since7 = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since14 = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
  const mid = since7;

  const supabase = serviceRoleClient();
  let events: EventRow[] = [];
  let analyses7 = 0;
  let analysesPrior = 0;

  if (supabase) {
    const [{ data: ev }, { count: a7 }, { count: aPrior }] = await Promise.all([
      supabase
        .from("api_events")
        .select("created_at, route, status_code, error_code")
        .gte("created_at", since14)
        .limit(8000),
      supabase
        .from("call_post_mortems")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since7),
      supabase
        .from("call_post_mortems")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since14)
        .lt("created_at", since7),
    ]);
    events = (ev ?? []) as EventRow[];
    analyses7 = a7 ?? 0;
    analysesPrior = aPrior ?? 0;
  }

  const currentFail = events.filter(
    (e) => e.created_at >= mid && e.status_code >= 400
  );
  const priorFail = events.filter(
    (e) => e.created_at < mid && e.status_code >= 400
  );
  const currentCats = tallyCategories(currentFail);
  const priorCats = tallyCategories(priorFail);

  const category_shift: CategoryBucket[] = Object.keys(emptyCategories()).map((category) => {
    const current_7d = currentCats[category] ?? 0;
    const prior_7d = priorCats[category] ?? 0;
    const delta = current_7d - prior_7d;
    return {
      category,
      current_7d,
      prior_7d,
      delta,
      changed: Math.abs(delta) >= 2 || (prior_7d === 0 && current_7d > 0),
    };
  });

  const errorsByProvider: Record<
    string,
    { count: number; last_at: string | null; last_code: string | null }
  > = {};
  for (const e of currentFail) {
    const id = providerFromRoute(e.route);
    if (!id) continue;
    const slot = errorsByProvider[id] ?? { count: 0, last_at: null, last_code: null };
    slot.count += 1;
    if (!slot.last_at || e.created_at > slot.last_at) {
      slot.last_at = e.created_at;
      slot.last_code = e.error_code;
    }
    errorsByProvider[id] = slot;
  }

  const [gemini, assembly, whitewhale] = await Promise.all([
    probeGemini(),
    probeAssemblyAI(),
    probeWhiteWhale(),
  ]);

  const integrationMap = Object.fromEntries(system.integrations.map((i) => [i.id, i]));

  const providers: ApiProviderHealth[] = [
    {
      id: "gemini",
      label: "Gemini (analysis)",
      category: "AI",
      status: gemini.status,
      configured: !!process.env.GEMINI_API_KEY?.trim(),
      meaning: gemini.meaning,
      billing: gemini.billing,
      last_error_at: errorsByProvider.gemini?.last_at ?? null,
      last_error_code: errorsByProvider.gemini?.last_code ?? null,
      error_count_7d: errorsByProvider.gemini?.count ?? 0,
      probe: "live",
    },
    {
      id: "assemblyai",
      label: "AssemblyAI (audio)",
      category: "Audio",
      status: assembly.status,
      configured: !!process.env.ASSEMBLYAI_API_KEY?.trim(),
      meaning: assembly.meaning,
      billing: assembly.billing,
      last_error_at: errorsByProvider.assemblyai?.last_at ?? null,
      last_error_code: errorsByProvider.assemblyai?.last_code ?? null,
      error_count_7d: errorsByProvider.assemblyai?.count ?? 0,
      probe: "live",
    },
    {
      id: "whitewhale",
      label: "WhiteWhale (signals)",
      category: "Signals",
      status: whitewhale.status,
      configured: isWhiteWhaleConfigured(),
      meaning: whitewhale.meaning,
      billing: whitewhale.billing,
      last_error_at: errorsByProvider.whitewhale?.last_at ?? null,
      last_error_code: errorsByProvider.whitewhale?.last_code ?? null,
      error_count_7d: errorsByProvider.whitewhale?.count ?? 0,
      probe: "live",
    },
    {
      id: "supabase",
      label: "Supabase (DB + Auth)",
      category: "Database",
      status: system.keys.supabase ? "ok" : "out",
      configured: !!process.env.SUPABASE_URL?.trim(),
      meaning: integrationMap.supabase?.meaning ?? "Supabase",
      billing: {
        level: "ok",
        detail: "Plan limits are in the Supabase dashboard (DB size, Auth MAUs).",
      },
      last_error_at: errorsByProvider.supabase?.last_at ?? null,
      last_error_code: errorsByProvider.supabase?.last_code ?? null,
      error_count_7d: errorsByProvider.supabase?.count ?? 0,
      probe: "config",
    },
    {
      id: "hubspot",
      label: "HubSpot",
      category: "CRM",
      status: !integrationMap.hubspot?.configured
        ? "not_configured"
        : integrationMap.hubspot.ok
          ? "ok"
          : "out",
      configured: !!integrationMap.hubspot?.configured,
      meaning: integrationMap.hubspot?.meaning ?? "HubSpot",
      billing: {
        level: "ok",
        detail: "CRM seat/API limits live in HubSpot billing — reconnect if token dies.",
      },
      last_error_at: errorsByProvider.hubspot?.last_at ?? null,
      last_error_code: errorsByProvider.hubspot?.last_code ?? null,
      error_count_7d: errorsByProvider.hubspot?.count ?? 0,
      probe: "config",
    },
    {
      id: "salesforce",
      label: "Salesforce",
      category: "CRM",
      status: !integrationMap.salesforce?.configured
        ? "not_configured"
        : integrationMap.salesforce.ok
          ? "ok"
          : "out",
      configured: !!integrationMap.salesforce?.configured,
      meaning: integrationMap.salesforce?.meaning ?? "Salesforce",
      billing: {
        level: "ok",
        detail: "API call limits are on the Salesforce org — reconnect OAuth if expired.",
      },
      last_error_at: null,
      last_error_code: null,
      error_count_7d: 0,
      probe: "config",
    },
    {
      id: "resend",
      label: "Resend (ops alerts)",
      category: "Email",
      status: process.env.RESEND_API_KEY?.trim() ? "ok" : "not_configured",
      configured: !!process.env.RESEND_API_KEY?.trim(),
      meaning: process.env.RESEND_API_KEY?.trim()
        ? "Alert email delivery configured."
        : "RESEND_API_KEY missing — digests stay in logs only.",
      billing: {
        level: "ok",
        detail: "Free Resend tier is usually enough for thrice-daily digests.",
      },
      last_error_at: null,
      last_error_code: null,
      error_count_7d: 0,
      probe: "config",
    },
  ];

  // Escalate from telemetry if live probe says ok but many recent failures
  for (const p of providers) {
    if (p.status === "ok" && p.error_count_7d >= 5) {
      p.status = "degraded";
      p.meaning = `${p.meaning} · ${p.error_count_7d} related errors in 7d.`;
    }
    if (
      p.id === "gemini" &&
      (currentCats.Quota ?? 0) >= 3 &&
      p.billing.level === "ok"
    ) {
      p.billing = {
        level: "pay_soon",
        detail: `${currentCats.Quota} quota errors in 7d — raise Gemini quota or switch model.`,
      };
      if (p.status === "ok") p.status = "degraded";
    }
  }

  const outages = providers.filter((p) => p.status === "out" || p.status === "degraded");

  const byDay: Record<string, { total: number; errors: number; quota_errors: number }> = {};
  for (const e of events.filter((x) => x.created_at >= mid)) {
    const day = e.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { total: 0, errors: 0, quota_errors: 0 };
    byDay[day].total += 1;
    if (e.status_code >= 400) byDay[day].errors += 1;
    if (isQuotaEvent(e)) byDay[day].quota_errors += 1;
  }

  const quota7 = currentFail.filter(isQuotaEvent).length;
  const quotaPrior = priorFail.filter(isQuotaEvent).length;
  const events7 = events.filter((e) => e.created_at >= mid).length;
  const errors7 = currentFail.length;

  const billing_alerts: ApisInventory["billing_alerts"] = [];
  for (const p of providers) {
    if (p.billing.level === "exhausted") {
      billing_alerts.push({
        id: `${p.id}-exhausted`,
        severity: "critical",
        title: `${p.label} — at the end of usage`,
        detail: p.billing.detail,
        action:
          p.id === "gemini"
            ? "Open Google AI Studio → raise quota or enable billing. Team analyses use Gemini 3.1 Pro, which has no free tier."
            : p.id === "whitewhale"
              ? "Top up WhiteWhale credits or pause active monitors."
              : "Upgrade the provider plan or wait for reset.",
      });
    } else if (p.billing.level === "pay_soon") {
      billing_alerts.push({
        id: `${p.id}-pay`,
        severity: "warning",
        title: `${p.label} — may need to pay / top up`,
        detail: p.billing.detail,
        action: "Check the provider billing dashboard before demos.",
      });
    } else if (p.billing.level === "watch") {
      billing_alerts.push({
        id: `${p.id}-watch`,
        severity: "info",
        title: `${p.label} — watch usage`,
        detail: p.billing.detail,
        action: "No action yet; glance at credits after heavy days.",
      });
    }
  }

  if (quota7 >= 3) {
    billing_alerts.push({
      id: "quota-telemetry",
      severity: quota7 >= 10 ? "critical" : "warning",
      title: "Quota errors showing up in Lazarus telemetry",
      detail: `${quota7} quota-classified failures in the last 7 days (was ${quotaPrior} prior week).`,
      action: "Usually Gemini free-tier — Team uses Gemini 3.1 Pro, which needs Google billing enabled.",
    });
  }

  if (analyses7 > analysesPrior * 2 && analyses7 >= 20) {
    billing_alerts.push({
      id: "volume-spike",
      severity: "info",
      title: "Analysis volume doubled vs prior week",
      detail: `${analyses7} analyses this week vs ${analysesPrior} prior — expect higher Gemini spend.`,
      action: "Confirm AI Studio billing alerts are on.",
    });
  }

  const criticalOut = providers.some((p) =>
    ["gemini", "supabase"].includes(p.id) && (p.status === "out" || p.status === "degraded")
  );
  const anyBillingCritical = billing_alerts.some((a) => a.severity === "critical");
  const status: ApisInventory["status"] = criticalOut || anyBillingCritical
    ? "critical"
    : outages.length > 0 || billing_alerts.some((a) => a.severity === "warning")
      ? "warning"
      : "ok";

  const category_changed = category_shift.some((c) => c.changed);
  const outLabels = outages.map((o) => o.label);
  const headlineParts: string[] = [];
  if (outLabels.length === 0) headlineParts.push("No APIs currently out");
  else headlineParts.push(`Out / degraded: ${outLabels.join(", ")}`);
  if (category_changed) {
    const movers = category_shift
      .filter((c) => c.changed)
      .map((c) => `${c.category} ${c.delta > 0 ? "+" : ""}${c.delta}`)
      .join(", ");
    headlineParts.push(`Category shift: ${movers}`);
  } else {
    headlineParts.push("Error mix unchanged vs prior week");
  }
  if (billing_alerts.some((a) => a.severity !== "info")) {
    headlineParts.push("Billing / usage needs attention");
  } else {
    headlineParts.push("Usage looks within normal bounds");
  }

  return {
    checked_at: new Date().toISOString(),
    headline: headlineParts.join(" · "),
    status,
    outages,
    providers,
    category_shift,
    category_changed,
    usage: {
      range: "7d",
      series: Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, v]) => ({ day, ...v })),
      analyses_7d: analyses7,
      analyses_prior_7d: analysesPrior,
      events_7d: events7,
      errors_7d: errors7,
      quota_errors_7d: quota7,
      quota_errors_prior_7d: quotaPrior,
    },
    billing_alerts,
  };
}
