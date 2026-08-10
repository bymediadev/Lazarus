import type { Request } from "express";

/** Soft anonymous rate limit so clearing localStorage is not unlimited free use. */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const DAY_MS = 24 * 60 * 60 * 1000;

function dailyLimit(): number {
  const n = Number((process.env.GUEST_ANALYSIS_DAILY_LIMIT ?? "10").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 10;
}

function clientKey(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  const ip = xf || req.socket.remoteAddress || "unknown";
  const ua = (req.headers["user-agent"] ?? "").slice(0, 120);
  return `${ip}|${ua}`;
}

function pruneExpired(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Returns true when the request should be blocked. */
export function isAnonymousGuestRateLimited(req: Request): boolean {
  const now = Date.now();
  pruneExpired(now);
  const key = clientKey(req);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + DAY_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= dailyLimit()) {
    return true;
  }
  bucket.count += 1;
  return false;
}

export function isDemoUsageBypassAllowed(req: Request): boolean {
  const header = String(req.headers["x-lazarus-demo-bypass"] ?? "").trim();
  if (header !== "1") return false;
  const envOn = (process.env.GUEST_USAGE_DEMO_BYPASS ?? "").trim().toLowerCase() === "true";
  const isProd = process.env.NODE_ENV === "production";
  return envOn || !isProd;
}

export function guestServerLimitMessage(): string {
  return `Anonymous free analyses are limited for today. Sign up to continue — paid plans come next.`;
}
