import type { Express, Request, Response } from "express";
import {
  cronSecretOk,
  getOpsUser,
  isOpsUser,
  requireOps,
  resolveAuthUser,
  serviceRoleClient,
} from "./founderAuth.js";
import { runCriticalAlertPass, runDigestAlert, isDigestHour } from "./founderAlerts.js";
import { buildSystemStatus, classifyIssue } from "./founderSystem.js";
import { buildApisInventory } from "./founderApis.js";
import { resolveFrontendOrigin } from "./integrations/oauthShared.js";

async function writeAudit(
  actorUserId: string | null,
  action: string,
  targetUserId?: string | null,
  targetDealId?: string | null,
  meta?: Record<string, unknown>
) {
  const supabase = serviceRoleClient();
  if (!supabase) return;
  await supabase.from("founder_audit_log").insert({
    actor_user_id: actorUserId,
    action,
    target_user_id: targetUserId ?? null,
    target_deal_id: targetDealId ?? null,
    meta: meta ?? null,
  });
}

function buildDiagnosisPacket(parts: Record<string, string | number | null | undefined>): string {
  const lines = ["LAZARUS DIAGNOSIS"];
  for (const [k, v] of Object.entries(parts)) {
    if (v === undefined || v === null || v === "") continue;
    lines.push(`${k}: ${v}`);
  }
  return lines.join("\n");
}

async function emailForUserId(userId: string): Promise<string | null> {
  const supabase = serviceRoleClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.admin.getUserById(userId);
  if (error || !data.user) return null;
  return data.user.email ?? null;
}

export function registerFounderRoutes(app: Express): void {
  app.get("/api/founder/me", async (req, res) => {
    const user = await resolveAuthUser(req);
    if (!user) {
      res.status(401).json({ founder: false, ops: false, error: "Unauthorized" });
      return;
    }
    const ops = isOpsUser(user);
    res.json({
      founder: ops,
      ops,
      email: user.email ?? null,
      user_id: user.id,
      role: user.app_metadata?.role ?? null,
    });
  });

  app.get("/api/founder/overview", requireOps, async (_req, res) => {
    try {
      const supabase = serviceRoleClient();
      const system = await buildSystemStatus();
      const since24 = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      let analyses24 = 0;
      let analyses7d = 0;
      let errors24 = 0;
      let events24 = 0;
      let durations: number[] = [];
      const peakHours: Record<string, number> = {};
      const hangups: Array<Record<string, unknown>> = [];

      if (supabase) {
        const { count: c24 } = await supabase
          .from("call_post_mortems")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since24);
        analyses24 = c24 ?? 0;

        const { count: c7 } = await supabase
          .from("call_post_mortems")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since7d);
        analyses7d = c7 ?? 0;

        const { data: events } = await supabase
          .from("api_events")
          .select("created_at, status_code, duration_ms, route, error_code, request_id, user_id, method")
          .gte("created_at", since24)
          .order("created_at", { ascending: false })
          .limit(2000);

        for (const e of events ?? []) {
          events24 += 1;
          if (e.status_code >= 400) errors24 += 1;
          if (typeof e.duration_ms === "number") durations.push(e.duration_ms);
          const hour = new Date(e.created_at).toISOString().slice(11, 13);
          peakHours[hour] = (peakHours[hour] ?? 0) + 1;
        }

        const { data: fails } = await supabase
          .from("api_events")
          .select("*")
          .gte("created_at", since24)
          .gte("status_code", 400)
          .order("created_at", { ascending: false })
          .limit(8);

        for (const f of fails ?? []) {
          const cls = classifyIssue(f.route, f.status_code, f.error_code);
          hangups.push({
            ...f,
            category: cls.category,
            likely_fix: cls.likely_fix,
            user_email: f.user_id ? await emailForUserId(f.user_id) : null,
          });
        }
      }

      durations.sort((a, b) => a - b);
      const avgLatency =
        durations.length > 0
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : null;
      const p95Latency =
        durations.length > 0
          ? durations[Math.min(durations.length - 1, Math.floor(durations.length * 0.95))]
          : null;

      const peakSeries = Array.from({ length: 24 }, (_, h) => {
        const key = String(h).padStart(2, "0");
        return { hour: key, count: peakHours[key] ?? 0 };
      });

      let overall: "ok" | "warning" | "critical" = system.status;
      if (errors24 >= 8) overall = "critical";
      else if (errors24 >= 3 && overall === "ok") overall = "warning";

      const { data: lastAlert } = supabase
        ? await supabase
            .from("founder_alert_state")
            .select("issue_key, severity, last_sent_at")
            .order("last_sent_at", { ascending: false })
            .limit(1)
            .maybeSingle()
        : { data: null };

      res.json({
        status: overall,
        system_status: system.status,
        stats: {
          analyses_24h: analyses24,
          analyses_7d: analyses7d,
          errors_24h: errors24,
          events_24h: events24,
          avg_latency_ms: avgLatency,
          p95_latency_ms: p95Latency,
        },
        peak_hours: peakSeries,
        hangups,
        last_alert: lastAlert,
        deploy: system.deploy,
        checked_at: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Overview failed" });
    }
  });

  app.get("/api/founder/system", requireOps, async (_req, res) => {
    try {
      const system = await buildSystemStatus();
      res.json(system);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "System status failed" });
    }
  });

  app.get("/api/founder/issues", requireOps, async (req, res) => {
    try {
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      const limit = Math.min(100, parseInt(String(req.query.limit ?? "40"), 10) || 40);
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("api_events")
        .select("*")
        .gte("created_at", since)
        .gte("status_code", 400)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      const issues = [];
      for (const row of data ?? []) {
        const cls = classifyIssue(row.route, row.status_code, row.error_code);
        const userEmail = row.user_id ? await emailForUserId(row.user_id) : null;
        const packet = buildDiagnosisPacket({
          When: row.created_at,
          User: userEmail ?? row.user_id,
          Route: `${row.method} ${row.route}`,
          Status: row.status_code,
          Error: row.error_code,
          Duration: row.duration_ms != null ? `${row.duration_ms}ms` : null,
          request_id: row.request_id,
          Category: cls.category,
          "Likely fix": cls.likely_fix,
        });
        issues.push({
          ...row,
          user_email: userEmail,
          category: cls.category,
          likely_fix: cls.likely_fix,
          diagnosis_packet: packet,
        });
      }
      res.json({ issues });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Issues failed" });
    }
  });

  app.get("/api/founder/usage", requireOps, async (req, res) => {
    try {
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      const range = String(req.query.range ?? "7d");
      const days = range === "24h" ? 1 : 7;
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("api_events")
        .select("created_at, status_code")
        .gte("created_at", since)
        .limit(5000);

      const byDay: Record<string, { total: number; errors: number }> = {};
      for (const e of data ?? []) {
        const day = e.created_at.slice(0, 10);
        if (!byDay[day]) byDay[day] = { total: 0, errors: 0 };
        byDay[day].total += 1;
        if (e.status_code >= 400) byDay[day].errors += 1;
      }
      res.json({
        range,
        series: Object.entries(byDay)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([day, v]) => ({ day, ...v })),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Usage failed" });
    }
  });

  /** Consolidated under-the-hood: outages, category shifts, usage, billing signals. */
  app.get("/api/founder/apis", requireOps, async (_req, res) => {
    try {
      const inventory = await buildApisInventory();
      res.json(inventory);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "APIs inventory failed" });
    }
  });

  app.get("/api/founder/lookup", requireOps, async (req, res) => {
    try {
      const email = String(req.query.email ?? "")
        .trim()
        .toLowerCase();
      if (!email || !email.includes("@")) {
        res.status(400).json({ error: "Pass ?email=" });
        return;
      }
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }

      let userId: string | null = null;
      let userMeta: Record<string, unknown> | null = null;
      for (let page = 1; page <= 5; page++) {
        const listed = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        const hit = (listed.data?.users ?? []).find(
          (u) => (u.email ?? "").toLowerCase() === email
        );
        if (hit) {
          userId = hit.id;
          userMeta = {
            id: hit.id,
            email: hit.email,
            created_at: hit.created_at,
            last_sign_in_at: hit.last_sign_in_at,
            login_provider: hit.app_metadata?.login_provider ?? null,
            role: hit.app_metadata?.role ?? null,
          };
          break;
        }
        if ((listed.data?.users?.length ?? 0) < 200) break;
      }

      if (!userId) {
        res.status(404).json({ error: "No user with that email" });
        return;
      }

      const { data: deals } = await supabase
        .from("call_post_mortems")
        .select(
          "id, client_name, deal_value, deal_status, stall_cause, created_at, ingest_metadata, deal_memory_summary"
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      const { data: events } = await supabase
        .from("api_events")
        .select("*")
        .eq("user_id", userId)
        .gte("status_code", 400)
        .order("created_at", { ascending: false })
        .limit(15);

      const { data: noteRow } = await supabase
        .from("founder_account_notes")
        .select("note, updated_at, updated_by")
        .eq("user_id", userId)
        .maybeSingle();

      const { data: crmLinks } = await supabase
        .from("crm_deal_links")
        .select("id, provider, external_deal_id, post_mortem_id, updated_at")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false })
        .limit(20);

      const issues = (events ?? []).map((row) => {
        const cls = classifyIssue(row.route, row.status_code, row.error_code);
        return {
          ...row,
          category: cls.category,
          likely_fix: cls.likely_fix,
          diagnosis_packet: buildDiagnosisPacket({
            When: row.created_at,
            User: email,
            Route: `${row.method} ${row.route}`,
            Status: row.status_code,
            Error: row.error_code,
            Duration: row.duration_ms != null ? `${row.duration_ms}ms` : null,
            request_id: row.request_id,
            Category: cls.category,
            "Likely fix": cls.likely_fix,
          }),
        };
      });

      res.json({
        user: userMeta,
        note: noteRow?.note ?? "",
        note_updated_at: noteRow?.updated_at ?? null,
        deals: deals ?? [],
        issues,
        crm_links: crmLinks ?? [],
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Lookup failed" });
    }
  });

  app.get("/api/founder/users/:userId/deals/:dealId", requireOps, async (req, res) => {
    try {
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      const showTranscript = String(req.query.transcript ?? "") === "1";
      const { data, error } = await supabase
        .from("call_post_mortems")
        .select("*")
        .eq("id", req.params.dealId)
        .eq("user_id", req.params.userId)
        .maybeSingle();
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ error: "Deal not found" });
        return;
      }

      const transcript = typeof data.transcript_text === "string" ? data.transcript_text : "";
      const payload = {
        ...data,
        transcript_text: showTranscript
          ? transcript
          : transcript
            ? `${transcript.slice(0, 280)}${transcript.length > 280 ? "…" : ""}`
            : null,
        transcript_truncated: !showTranscript && transcript.length > 280,
        transcript_length: transcript.length,
        diagnosis_packet: buildDiagnosisPacket({
          When: data.created_at,
          User: req.params.userId,
          "Deal id": data.id,
          Client: data.client_name,
          Status: data.deal_status,
          Headline: data.stall_cause,
          request_id: null,
        }),
      };
      res.json({ deal: payload });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Deal detail failed" });
    }
  });

  app.delete("/api/founder/users/:userId/deals/:dealId", requireOps, async (req, res) => {
    try {
      const actor = getOpsUser(req);
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      await supabase.from("crm_deal_links").delete().eq("post_mortem_id", req.params.dealId);
      const { error } = await supabase
        .from("call_post_mortems")
        .delete()
        .eq("id", req.params.dealId)
        .eq("user_id", req.params.userId);
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      await writeAudit(actor?.id ?? null, "delete_deal", req.params.userId, req.params.dealId);
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Delete failed" });
    }
  });

  app.post("/api/founder/users/:userId/password-reset", requireOps, async (req, res) => {
    try {
      const actor = getOpsUser(req);
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      const { data: userData, error: userErr } = await supabase.auth.admin.getUserById(
        req.params.userId
      );
      if (userErr || !userData.user?.email) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      const redirectTo = `${resolveFrontendOrigin().replace(/\/$/, "")}/?lazarus_reset=1`;
      const { error } = await supabase.auth.resetPasswordForEmail(userData.user.email, {
        redirectTo,
      });
      if (error) {
        // Admin generateLink fallback
        const link = await supabase.auth.admin.generateLink({
          type: "recovery",
          email: userData.user.email,
          options: { redirectTo },
        });
        if (link.error) {
          res.status(500).json({ error: link.error.message });
          return;
        }
      }
      await writeAudit(actor?.id ?? null, "password_reset", req.params.userId, null, {
        email: userData.user.email,
      });
      res.json({ ok: true, email: userData.user.email });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : "Password reset failed",
      });
    }
  });

  app.post("/api/founder/users/:userId/note", requireOps, async (req, res) => {
    try {
      const actor = getOpsUser(req);
      const note = String(req.body?.note ?? "");
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Supabase not configured" });
        return;
      }
      const { error } = await supabase.from("founder_account_notes").upsert({
        user_id: req.params.userId,
        note,
        updated_at: new Date().toISOString(),
        updated_by: actor?.id ?? null,
      });
      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      await writeAudit(actor?.id ?? null, "ops_note", req.params.userId, null, {
        note_length: note.length,
      });
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Note save failed" });
    }
  });

  app.post("/api/founder/alerts/run", async (req, res) => {
    if (!cronSecretOk(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const result = await runCriticalAlertPass();
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Alert run failed" });
    }
  });

  app.post("/api/founder/alerts/digest", async (req, res) => {
    if (!cronSecretOk(req)) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    try {
      const forceSlot = typeof req.body?.slot === "string" ? req.body.slot : undefined;
      const check = isDigestHour();
      if (!forceSlot && !check.yes) {
        res.json({
          ok: true,
          sent: false,
          detail: `not a digest hour (now ${check.hour} in alert TZ)`,
          hour: check.hour,
        });
        return;
      }
      const result = await runDigestAlert(forceSlot || check.slot);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Digest failed" });
    }
  });

  // Optional: authenticated ops can trigger a test digest
  app.post("/api/founder/alerts/test-digest", requireOps, async (req: Request, res: Response) => {
    try {
      const slot = typeof req.body?.slot === "string" ? req.body.slot : "afternoon";
      const result = await runDigestAlert(slot);
      await writeAudit(getOpsUser(req)?.id ?? null, "test_digest", null, null, result);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Test digest failed" });
    }
  });
}
