import type { Request, Response } from "express";
import { isFreemiumExempt } from "./guestRateLimit.js";
import { serviceRoleClient } from "./founderAuth.js";

export type RuntimeConfig = {
  analyses_paused: boolean;
  pause_message: string;
  daily_analysis_cap: number | null;
  updated_at: string | null;
  updated_by: string | null;
};

const DEFAULT_PAUSE = "Analyses are paused. Try again shortly.";
const CACHE_MS = 4000;

let cache: { at: number; value: RuntimeConfig } | null = null;

function fallbackConfig(): RuntimeConfig {
  return {
    analyses_paused: false,
    pause_message: DEFAULT_PAUSE,
    daily_analysis_cap: null,
    updated_at: null,
    updated_by: null,
  };
}

export function invalidateRuntimeConfigCache(): void {
  cache = null;
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  const supabase = serviceRoleClient();
  if (!supabase) {
    cache = { at: now, value: fallbackConfig() };
    return cache.value;
  }

  const { data, error } = await supabase
    .from("app_runtime_config")
    .select("analyses_paused, pause_message, daily_analysis_cap, updated_at, updated_by")
    .eq("id", "default")
    .maybeSingle();

  if (error || !data) {
    if (error) console.warn("[runtime-config]", error.message);
    cache = { at: now, value: fallbackConfig() };
    return cache.value;
  }

  const capRaw = data.daily_analysis_cap;
  const cap =
    typeof capRaw === "number" && Number.isFinite(capRaw) && capRaw > 0
      ? Math.floor(capRaw)
      : null;

  const value: RuntimeConfig = {
    analyses_paused: !!data.analyses_paused,
    pause_message: String(data.pause_message || DEFAULT_PAUSE).slice(0, 280),
    daily_analysis_cap: cap,
    updated_at: data.updated_at ? String(data.updated_at) : null,
    updated_by: data.updated_by ? String(data.updated_by) : null,
  };
  cache = { at: now, value };
  return value;
}

export async function saveRuntimeConfig(
  patch: Partial<Pick<RuntimeConfig, "analyses_paused" | "pause_message" | "daily_analysis_cap">>,
  updatedBy: string | null
): Promise<RuntimeConfig> {
  const supabase = serviceRoleClient();
  if (!supabase) throw new Error("Supabase is not configured.");

  const current = await getRuntimeConfig();
  const next = {
    id: "default",
    analyses_paused: patch.analyses_paused ?? current.analyses_paused,
    pause_message: (patch.pause_message ?? current.pause_message).trim().slice(0, 280) || DEFAULT_PAUSE,
    daily_analysis_cap:
      patch.daily_analysis_cap === undefined ? current.daily_analysis_cap : patch.daily_analysis_cap,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  const { error } = await supabase.from("app_runtime_config").upsert(next, { onConflict: "id" });
  if (error) throw new Error(error.message);
  invalidateRuntimeConfigCache();
  return getRuntimeConfig();
}

export async function countAnalysesSince(iso: string): Promise<number> {
  const supabase = serviceRoleClient();
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from("call_post_mortems")
    .select("id", { count: "exact", head: true })
    .gte("created_at", iso);
  if (error) {
    console.warn("[runtime-config] analysis count:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function countAnalysesTodayUtc(): Promise<number> {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  return countAnalysesSince(start.toISOString());
}

/** Returns true if the response was already sent (caller should return). */
export async function rejectIfAnalysesBlocked(req: Request, res: Response): Promise<boolean> {
  const cfg = await getRuntimeConfig();
  const exempt = await isFreemiumExempt(req);

  if (cfg.analyses_paused && !exempt) {
    res.status(503).json({
      error: cfg.pause_message,
      code: "ANALYSES_PAUSED",
    });
    return true;
  }

  if (cfg.daily_analysis_cap != null && !exempt) {
    const used = await countAnalysesTodayUtc();
    if (used >= cfg.daily_analysis_cap) {
      res.status(429).json({
        error: `Daily analysis cap (${cfg.daily_analysis_cap}) reached. Try again tomorrow.`,
        code: "DAILY_ANALYSIS_CAP",
      });
      return true;
    }
  }

  return false;
}
