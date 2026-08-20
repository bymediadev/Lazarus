import { alertEmailAllowlist, serviceRoleClient } from "./founderAuth.js";
import { buildSystemStatus, classifyIssue } from "./founderSystem.js";

export type AlertSeverity = "ok" | "warning" | "critical";

const COOLDOWN_MS = 45 * 60 * 1000;

function parseHours(): number[] {
  const raw = (process.env.FOUNDER_ALERT_HOURS ?? "8,13,20").trim();
  const hours = raw
    .split(",")
    .map((h) => parseInt(h.trim(), 10))
    .filter((h) => Number.isFinite(h) && h >= 0 && h <= 23);
  return hours.length ? hours : [8, 13, 20];
}

export function alertTimezone(): string {
  return (process.env.FOUNDER_ALERT_TZ ?? "America/New_York").trim() || "America/New_York";
}

export function digestSlotLabel(hour: number): string {
  if (hour < 11) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

/** Current hour in FOUNDER_ALERT_TZ (0–23). */
export function currentHourInAlertTz(now = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: alertTimezone(),
    hour: "numeric",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  // hour12:false can still yield 24 in some engines
  return hour === 24 ? 0 : hour;
}

export function isDigestHour(now = new Date()): { yes: boolean; slot: string; hour: number } {
  const hour = currentHourInAlertTz(now);
  const hours = parseHours();
  return { yes: hours.includes(hour), slot: digestSlotLabel(hour), hour };
}

async function fetchRecentFailures(minutes: number, limit = 20) {
  const supabase = serviceRoleClient();
  if (!supabase) return [];
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("api_events")
    .select("id, created_at, request_id, route, method, status_code, duration_ms, user_id, error_code")
    .gte("created_at", since)
    .gte("status_code", 400)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("[founderAlerts] failures query:", error.message);
    return [];
  }
  return data ?? [];
}

async function countEvents(minutes: number): Promise<{ total: number; errors: number; analyses: number }> {
  const supabase = serviceRoleClient();
  if (!supabase) return { total: 0, errors: 0, analyses: 0 };
  const since = new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from("api_events")
    .select("status_code, route")
    .gte("created_at", since)
    .limit(5000);
  if (error || !data) return { total: 0, errors: 0, analyses: 0 };
  const total = data.length;
  const errors = data.filter((r) => r.status_code >= 400).length;
  const analyses = data.filter(
    (r) => typeof r.route === "string" && r.route.includes("post-mortem") && r.status_code < 400
  ).length;
  return { total, errors, analyses };
}

async function countAnalysesSince(iso: string): Promise<number> {
  const supabase = serviceRoleClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("call_post_mortems")
    .select("id", { count: "exact", head: true })
    .gte("created_at", iso);
  if (error) return 0;
  return count ?? 0;
}

export async function evaluateHealthSeverity(): Promise<{
  severity: AlertSeverity;
  reasons: string[];
  failures: Awaited<ReturnType<typeof fetchRecentFailures>>;
  stats: { total: number; errors: number; analyses: number };
  system: Awaited<ReturnType<typeof buildSystemStatus>>;
}> {
  const system = await buildSystemStatus();
  const failures = await fetchRecentFailures(30, 15);
  const stats = await countEvents(30);
  const reasons: string[] = [];

  if (system.status === "critical") {
    reasons.push("Core system health is CRITICAL (Gemini/Supabase).");
  } else if (system.status === "warning") {
    reasons.push("Integration warning (configured but token missing).");
  }

  if (stats.errors >= 8) {
    reasons.push(`High error count in last 30m: ${stats.errors} failures.`);
  } else if (stats.errors >= 3) {
    reasons.push(`Elevated errors in last 30m: ${stats.errors} failures.`);
  }

  if (stats.total >= 5 && stats.errors / stats.total >= 0.5) {
    reasons.push(`Error rate ≥50% in last 30m (${stats.errors}/${stats.total}).`);
  }

  let severity: AlertSeverity = "ok";
  if (
    system.status === "critical" ||
    stats.errors >= 8 ||
    (stats.total >= 5 && stats.errors / stats.total >= 0.5)
  ) {
    severity = "critical";
  } else if (system.status === "warning" || stats.errors >= 3 || failures.length >= 3) {
    severity = "warning";
  }

  return { severity, reasons, failures, stats, system };
}

function formatMiniPacket(input: {
  severity: AlertSeverity;
  reasons: string[];
  failures: Awaited<ReturnType<typeof fetchRecentFailures>>;
  system: Awaited<ReturnType<typeof buildSystemStatus>>;
  slot?: string;
}): string {
  const lines = [
    "LAZARUS DIAGNOSIS",
    `Severity: ${input.severity.toUpperCase()}`,
    input.slot ? `Digest: ${input.slot}` : "Type: break-through",
    `When: ${new Date().toISOString()}`,
    `Deploy: ${input.system.deploy.git_sha ?? "unknown"} boot ${input.system.deploy.boot_time}`,
    `Reasons: ${input.reasons.join(" | ") || "none"}`,
    `Health: ${input.system.integrations
      .map((i) => `${i.id}=${i.ok ? "ok" : "bad"}`)
      .join(" ")}`,
  ];
  for (const f of input.failures.slice(0, 3)) {
    const cls = classifyIssue(f.route, f.status_code, f.error_code);
    lines.push(
      `Fail: ${f.created_at} ${f.method} ${f.route} ${f.status_code} req=${f.request_id} err=${f.error_code ?? ""} [${cls.category}] ${cls.likely_fix}`
    );
  }
  return lines.join("\n");
}

export async function sendResendEmail(to: string[], subject: string, text: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = (process.env.RESEND_API_KEY ?? "").trim();
  const from = (process.env.FOUNDER_ALERT_FROM ?? "Lazarus Ops <onboarding@resend.dev>").trim();
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  if (to.length === 0) {
    return { ok: false, error: "FOUNDER_ALERT_EMAILS empty" };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `Resend ${res.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "send failed" };
  }
}

async function getAlertState(issueKey: string) {
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  const { data } = await supabase
    .from("founder_alert_state")
    .select("*")
    .eq("issue_key", issueKey)
    .maybeSingle();
  return data;
}

async function upsertAlertState(
  issueKey: string,
  severity: string,
  meta?: Record<string, unknown>,
  resolved = false
) {
  const supabase = serviceRoleClient();
  if (!supabase) return;
  const row: Record<string, unknown> = {
    issue_key: issueKey,
    severity,
    last_sent_at: new Date().toISOString(),
    meta: meta ?? null,
  };
  if (resolved) row.last_resolved_at = new Date().toISOString();
  await supabase.from("founder_alert_state").upsert(row);
}

export async function runCriticalAlertPass(): Promise<{
  sent: boolean;
  severity: AlertSeverity;
  detail: string;
}> {
  const evaled = await evaluateHealthSeverity();
  const to = alertEmailAllowlist();

  if (evaled.severity !== "critical") {
    const prior = await getAlertState("critical_spike");
    if (prior && prior.severity === "critical" && !prior.last_resolved_at) {
      const subject = "LAZARUS RESOLVED — critical condition cleared";
      const text = [
        "Previous CRITICAL condition appears cleared.",
        `Current severity: ${evaled.severity.toUpperCase()}`,
        formatMiniPacket({ ...evaled, reasons: evaled.reasons.length ? evaled.reasons : ["cleared"] }),
      ].join("\n\n");
      const sent = await sendResendEmail(to, subject, text);
      await upsertAlertState("critical_spike", "ok", { resolved: true }, true);
      return {
        sent: sent.ok,
        severity: evaled.severity,
        detail: sent.ok ? "RESOLVED email sent" : sent.error ?? "resolve send failed",
      };
    }
    return { sent: false, severity: evaled.severity, detail: "no critical condition" };
  }

  const prior = await getAlertState("critical_spike");
  if (prior?.last_sent_at) {
    const elapsed = Date.now() - new Date(prior.last_sent_at).getTime();
    if (elapsed < COOLDOWN_MS && prior.severity === "critical") {
      return { sent: false, severity: "critical", detail: "cooldown active" };
    }
  }

  const subject = "LAZARUS CRITICAL — jump on this";
  const text = [
    "Lazarus needs attention now (break-through alert between digests).",
    ...evaled.reasons.map((r) => `- ${r}`),
    "",
    "Open the Ops Command Center → Issues, then paste the packet into Cursor.",
    "",
    formatMiniPacket(evaled),
  ].join("\n");

  const sent = await sendResendEmail(to, subject, text);
  if (sent.ok) {
    await upsertAlertState("critical_spike", "critical", { reasons: evaled.reasons });
  }
  return {
    sent: sent.ok,
    severity: "critical",
    detail: sent.ok ? "CRITICAL email sent" : sent.error ?? "send failed",
  };
}

export async function runDigestAlert(slot?: string): Promise<{
  sent: boolean;
  severity: AlertSeverity;
  slot: string;
  detail: string;
}> {
  const hour = currentHourInAlertTz();
  const resolvedSlot = slot || digestSlotLabel(hour);
  const evaled = await evaluateHealthSeverity();
  const sinceHours = resolvedSlot === "morning" ? 12 : resolvedSlot === "afternoon" ? 5 : 7;
  const sinceIso = new Date(Date.now() - sinceHours * 60 * 60 * 1000).toISOString();
  const analyses = await countAnalysesSince(sinceIso);
  const windowStats = await countEvents(sinceHours * 60);

  const digestKey = `digest:${new Date().toISOString().slice(0, 10)}:${resolvedSlot}`;
  const prior = await getAlertState(digestKey);
  if (prior) {
    return {
      sent: false,
      severity: evaled.severity,
      slot: resolvedSlot,
      detail: "digest already sent for this slot",
    };
  }

  const subject = `LAZARUS ${evaled.severity.toUpperCase()} — ${resolvedSlot} check`;
  const text = [
    `Lazarus ${resolvedSlot} status: ${evaled.severity.toUpperCase()}`,
    `Timezone: ${alertTimezone()}`,
    `Since ~${sinceHours}h: analyses_saved=${analyses}, api_events=${windowStats.total}, errors=${windowStats.errors}`,
    `Last 30m: events=${evaled.stats.total}, errors=${evaled.stats.errors}`,
    evaled.reasons.length ? `Notes:\n${evaled.reasons.map((r) => `- ${r}`).join("\n")}` : "Notes: none",
    "",
    "Integrations:",
    ...evaled.system.integrations.map(
      (i) => `- ${i.label}: ${i.ok ? "OK" : "ISSUE"} — ${i.meaning}`
    ),
    "",
    `Deploy: ${evaled.system.deploy.git_sha ?? "unknown"} · boot ${evaled.system.deploy.boot_time}`,
    "",
    "Open Lazarus → Ops Command Center → Issues if anything looks wrong.",
    "",
    evaled.severity === "ok"
      ? "(No diagnosis packet — status OK.)"
      : formatMiniPacket({ ...evaled, slot: resolvedSlot }),
  ].join("\n");

  const to = alertEmailAllowlist();
  const sent = await sendResendEmail(to, subject, text);
  if (sent.ok) {
    await upsertAlertState(digestKey, evaled.severity, { slot: resolvedSlot });
  }
  return {
    sent: sent.ok,
    severity: evaled.severity,
    slot: resolvedSlot,
    detail: sent.ok ? "digest sent" : sent.error ?? "send failed",
  };
}
