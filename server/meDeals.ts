import type { Express, Request, Response, NextFunction } from "express";
import { optionalAuthUserId } from "./authMiddleware.js";
import { serviceRoleClient } from "./founderAuth.js";
import { isFreemiumExempt } from "./guestRateLimit.js";
import { getFeatureAccess, LIFECYCLE_REQUIRED_MESSAGE } from "./billing.js";

export type LifecyclePhase =
  | "active"
  | "unstuck"
  | "stalled_recoverable"
  | "stalled_uncertain"
  | "stalled_high_risk"
  | "closed_lost_recoverable"
  | "closed_lost_unlikely"
  | "closed_won"
  | "unknown";

type MemorySummary = {
  deal_risk_index?: number;
  risk_tier?: string;
  viability_score?: number;
  viability_state?: string;
  trajectory_type?: string;
  deal_status?: string;
  live_deal_triage?: { root_issue?: string; core_blocker?: string };
};

type IngestMeta = {
  account_id?: string;
  sales_cycle_days?: number;
  whitewhale_domain?: string;
};

type DealRow = {
  id: string;
  client_name: string;
  deal_value: number;
  deal_status: string;
  stall_cause: string;
  created_at: string;
  ingest_metadata: IngestMeta | null;
  deal_memory_summary: MemorySummary | null;
};

type CrmLinkRow = {
  id: string;
  provider: "hubspot" | "salesforce";
  external_deal_id: string;
  post_mortem_id: string | null;
  account_id: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  updated_at: string;
};

function requireAuthUser(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void (async () => {
    const userId = await optionalAuthUserId(req);
    if (!userId) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    (req as Request & { authUserId?: string }).authUserId = userId;
    next();
  })().catch(next);
}

function requireLifecycleAccess(req: Request, res: Response, next: NextFunction): void {
  void (async () => {
    if (await isFreemiumExempt(req)) {
      next();
      return;
    }
    const userId = (req as Request & { authUserId?: string }).authUserId;
    if (!userId) {
      res.status(401).json({ error: "Sign in required" });
      return;
    }
    const access = await getFeatureAccess(userId);
    if (!access.lifecycle) {
      res.status(402).json({
        error: LIFECYCLE_REQUIRED_MESSAGE,
        code: "LIFECYCLE_REQUIRED",
      });
      return;
    }
    next();
  })().catch(next);
}

function authUserId(req: Request): string {
  return (req as Request & { authUserId?: string }).authUserId!;
}

export function lifecyclePhaseFromStatus(status: string): LifecyclePhase {
  const s = status.toUpperCase();
  if (s.includes("CLOSED WON") || s === "CLOSED_WON") return "closed_won";
  if (s.includes("CLOSED LOST") && s.includes("RECOVERABLE")) return "closed_lost_recoverable";
  if (s.includes("CLOSED LOST")) return "closed_lost_unlikely";
  if (s.includes("HIGH RISK")) return "stalled_high_risk";
  if (s.includes("UNCERTAIN")) return "stalled_uncertain";
  if (s.includes("RECOVERABLE") || s.includes("STALLED")) return "stalled_recoverable";
  if (s.includes("ACTIVE")) return "active";
  return "unknown";
}

export function lifecycleLabel(phase: LifecyclePhase): string {
  switch (phase) {
    case "active":
      return "Active — moving";
    case "unstuck":
      return "Unstuck — improving";
    case "stalled_recoverable":
      return "Stalled — recoverable";
    case "stalled_uncertain":
      return "Stalled — uncertain";
    case "stalled_high_risk":
      return "Stalled — high risk";
    case "closed_lost_recoverable":
      return "Closed lost — recoverable";
    case "closed_lost_unlikely":
      return "Closed lost — unlikely";
    case "closed_won":
      return "Closed won";
    default:
      return "Status unknown";
  }
}

function phaseRank(phase: LifecyclePhase): number {
  const order: LifecyclePhase[] = [
    "closed_lost_unlikely",
    "stalled_high_risk",
    "stalled_uncertain",
    "stalled_recoverable",
    "closed_lost_recoverable",
    "unknown",
    "active",
    "unstuck",
    "closed_won",
  ];
  return order.indexOf(phase);
}

function normalizeClientKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function threadKeyForRun(
  row: DealRow,
  linkByPostMortem: Map<string, CrmLinkRow>,
  clientToCrmKey: Map<string, string>
): string {
  const link = linkByPostMortem.get(row.id);
  if (link) return `crm:${link.provider}:${link.external_deal_id}`;
  const account = row.ingest_metadata?.account_id?.trim().toLowerCase();
  const client = normalizeClientKey(row.client_name || "unknown");
  if (account) {
    const acctKey = `acct:${account}:${client}`;
    if (clientToCrmKey.has(acctKey)) return clientToCrmKey.get(acctKey)!;
  }
  if (clientToCrmKey.has(client)) return clientToCrmKey.get(client)!;
  if (account) return `acct:${account}:${client}`;
  return `client:${client}`;
}

function runSnapshot(row: DealRow) {
  const mem = row.deal_memory_summary ?? {};
  const phase = lifecyclePhaseFromStatus(mem.deal_status || row.deal_status);
  return {
    id: row.id,
    created_at: row.created_at,
    client_name: row.client_name,
    deal_value: Number(row.deal_value) || 0,
    deal_status: mem.deal_status || row.deal_status,
    headline: row.stall_cause,
    lifecycle_phase: phase,
    lifecycle_label: lifecycleLabel(phase),
    deal_risk_index: typeof mem.deal_risk_index === "number" ? mem.deal_risk_index : null,
    risk_tier: mem.risk_tier ?? null,
    viability_score: typeof mem.viability_score === "number" ? mem.viability_score : null,
    viability_state: mem.viability_state ?? null,
    trajectory_type: mem.trajectory_type ?? null,
    core_blocker: mem.live_deal_triage?.core_blocker ?? null,
    account_id: row.ingest_metadata?.account_id ?? null,
  };
}

function improvementBetween(
  older: ReturnType<typeof runSnapshot>,
  newer: ReturnType<typeof runSnapshot>
): {
  direction: "improved" | "worsened" | "flat" | "unknown";
  summary: string;
  viability_delta: number | null;
  risk_delta: number | null;
  phase_delta: number;
} {
  const viability_delta =
    older.viability_score != null && newer.viability_score != null
      ? newer.viability_score - older.viability_score
      : null;
  const risk_delta =
    older.deal_risk_index != null && newer.deal_risk_index != null
      ? newer.deal_risk_index - older.deal_risk_index
      : null;
  const phase_delta = phaseRank(newer.lifecycle_phase) - phaseRank(older.lifecycle_phase);

  let score = 0;
  if (viability_delta != null) score += Math.sign(viability_delta);
  if (risk_delta != null) score -= Math.sign(risk_delta); // lower risk = better
  if (phase_delta !== 0) score += Math.sign(phase_delta);

  const direction =
    score > 0 ? "improved" : score < 0 ? "worsened" : viability_delta == null && risk_delta == null ? "unknown" : "flat";

  const bits: string[] = [];
  if (viability_delta != null && viability_delta !== 0) {
    bits.push(`viability ${viability_delta > 0 ? "+" : ""}${viability_delta}`);
  }
  if (risk_delta != null && risk_delta !== 0) {
    bits.push(`risk ${risk_delta > 0 ? "+" : ""}${risk_delta}`);
  }
  if (phase_delta > 0) bits.push("lifecycle improved");
  if (phase_delta < 0) bits.push("lifecycle slipped");
  if (!bits.length) bits.push(direction === "unknown" ? "not enough scored runs yet" : "no material change");

  return {
    direction,
    summary: bits.join(" · "),
    viability_delta,
    risk_delta,
    phase_delta,
  };
}

export function registerMeDealRoutes(app: Express): void {
  app.get("/api/me/deals", requireAuthUser, requireLifecycleAccess, async (req, res) => {
    try {
      const userId = authUserId(req);
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }

      const [{ data: rows, error }, { data: links, error: linkErr }] = await Promise.all([
        supabase
          .from("call_post_mortems")
          .select(
            "id, client_name, deal_value, deal_status, stall_cause, created_at, ingest_metadata, deal_memory_summary"
          )
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("crm_deal_links")
          .select(
            "id, provider, external_deal_id, post_mortem_id, account_id, last_inbound_at, last_outbound_at, updated_at"
          )
          .eq("user_id", userId)
          .limit(200),
      ]);

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      if (linkErr) {
        console.warn("[me/deals] crm links:", linkErr.message);
      }

      const dealRows = (rows ?? []) as DealRow[];
      const crmLinks = (links ?? []) as CrmLinkRow[];
      const linkByPostMortem = new Map<string, CrmLinkRow>();
      for (const link of crmLinks) {
        if (link.post_mortem_id) linkByPostMortem.set(link.post_mortem_id, link);
      }

      // Pull older runs for the same client/account into the CRM thread once any run is linked.
      const clientToCrmKey = new Map<string, string>();
      for (const row of dealRows) {
        const link = linkByPostMortem.get(row.id);
        if (!link) continue;
        const crmKey = `crm:${link.provider}:${link.external_deal_id}`;
        const client = normalizeClientKey(row.client_name || "unknown");
        clientToCrmKey.set(client, crmKey);
        const account = row.ingest_metadata?.account_id?.trim().toLowerCase();
        if (account) clientToCrmKey.set(`acct:${account}:${client}`, crmKey);
      }

      const groups = new Map<
        string,
        {
          thread_key: string;
          runs: ReturnType<typeof runSnapshot>[];
          crm: CrmLinkRow | null;
        }
      >();

      // Oldest → newest for timeline math, but we fetched newest first
      const chronological = [...dealRows].sort((a, b) =>
        a.created_at.localeCompare(b.created_at)
      );

      for (const row of chronological) {
        const key = threadKeyForRun(row, linkByPostMortem, clientToCrmKey);
        const snap = runSnapshot(row);
        const existing = groups.get(key);
        const crm = linkByPostMortem.get(row.id) ?? existing?.crm ?? null;
        if (existing) {
          existing.runs.push(snap);
          if (!existing.crm && crm) existing.crm = crm;
        } else {
          groups.set(key, { thread_key: key, runs: [snap], crm });
        }
      }

      // Prefer CRM row from links table even if only latest post_mortem_id matches
      for (const link of crmLinks) {
        const crmKey = `crm:${link.provider}:${link.external_deal_id}`;
        const g = groups.get(crmKey);
        if (g && !g.crm) g.crm = link;
      }

      const threads = [...groups.values()]
        .map((g) => {
          const runs = g.runs;
          const latest = runs[runs.length - 1];
          const earliest = runs[0];
          const improvement =
            runs.length >= 2 ? improvementBetween(earliest, latest) : null;

          let phase = latest.lifecycle_phase;
          if (
            improvement?.direction === "improved" &&
            (phase === "stalled_recoverable" ||
              phase === "stalled_uncertain" ||
              phase === "stalled_high_risk")
          ) {
            phase = "unstuck";
          }

          const timeline = runs.map((run, idx) => {
            const prev = idx > 0 ? runs[idx - 1] : null;
            const step = prev ? improvementBetween(prev, run) : null;
            return {
              ...run,
              since_previous: step,
            };
          });

          return {
            thread_key: g.thread_key,
            client_name: latest.client_name,
            deal_value: latest.deal_value,
            run_count: runs.length,
            latest_run_id: latest.id,
            latest_at: latest.created_at,
            first_at: earliest.created_at,
            lifecycle_phase: phase,
            lifecycle_label: lifecycleLabel(phase),
            deal_status: latest.deal_status,
            deal_risk_index: latest.deal_risk_index,
            viability_score: latest.viability_score,
            risk_tier: latest.risk_tier,
            core_blocker: latest.core_blocker,
            headline: latest.headline,
            account_id: latest.account_id ?? g.crm?.account_id ?? null,
            crm: g.crm
              ? {
                  provider: g.crm.provider,
                  external_deal_id: g.crm.external_deal_id,
                  last_inbound_at: g.crm.last_inbound_at,
                  last_outbound_at: g.crm.last_outbound_at,
                  linked: true,
                }
              : { provider: null, external_deal_id: null, linked: false },
            improvement,
            timeline: [...timeline].reverse(), // newest first for UI
          };
        })
        .sort((a, b) => b.latest_at.localeCompare(a.latest_at));

      const summary = {
        deal_threads: threads.length,
        total_runs: dealRows.length,
        crm_linked: threads.filter((t) => t.crm.linked).length,
        stalled: threads.filter((t) => t.lifecycle_phase.startsWith("stalled")).length,
        unstuck_or_active: threads.filter((t) =>
          ["unstuck", "active", "closed_won"].includes(t.lifecycle_phase)
        ).length,
        improved: threads.filter((t) => t.improvement?.direction === "improved").length,
      };

      res.json({ summary, threads });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load deals" });
    }
  });

  app.get("/api/me/deals/:id", requireAuthUser, requireLifecycleAccess, async (req, res) => {
    try {
      const userId = authUserId(req);
      const dealId = String(req.params.id ?? "").trim();
      if (!dealId) {
        res.status(400).json({ error: "Missing deal id" });
        return;
      }
      const supabase = serviceRoleClient();
      if (!supabase) {
        res.status(503).json({ error: "Database not configured" });
        return;
      }

      const { data, error } = await supabase
        .from("call_post_mortems")
        .select(
          "id, client_name, deal_value, deal_status, stall_cause, why_it_stalled, restart_plan, created_at, analysis_json, ingest_metadata, deal_memory_summary, user_id"
        )
        .eq("id", dealId)
        .eq("user_id", userId)
        .maybeSingle();

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }
      if (!data) {
        res.status(404).json({ error: "Deal not found" });
        return;
      }

      const { data: crm } = await supabase
        .from("crm_deal_links")
        .select("provider, external_deal_id, account_id, last_inbound_at, last_outbound_at")
        .eq("user_id", userId)
        .eq("post_mortem_id", dealId)
        .maybeSingle();

      let analysis: Record<string, unknown> = {};
      if (data.analysis_json) {
        try {
          analysis =
            typeof data.analysis_json === "string"
              ? (JSON.parse(data.analysis_json) as Record<string, unknown>)
              : (data.analysis_json as Record<string, unknown>);
        } catch {
          analysis = {};
        }
      }

      res.json({
        id: data.id,
        created_at: data.created_at,
        client_name: data.client_name,
        deal_value: data.deal_value,
        deal_status: data.deal_status,
        stall_cause: data.stall_cause,
        ingest_metadata: data.ingest_metadata,
        deal_memory_summary: data.deal_memory_summary,
        crm: crm ?? null,
        analysis: {
          ...analysis,
          id: data.id,
          client_name: analysis.client_name ?? data.client_name,
        },
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : "Failed to load deal" });
    }
  });
}
