import type { Request } from "express";
import { isOpsUser, resolveAuthUser } from "./founderAuth.js";

/** Soft freemium rate limit so clearing localStorage is not unlimited free use. */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const DAY_MS = 24 * 60 * 60 * 1000;

/** Founder demo account — the only hard-coded unlimited email. */
const FOUNDER_UNLIMITED_EMAILS = new Set(["joshua.bennett003@gmail.com"]);

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

function bumpAndLimited(key: string): boolean {
  const now = Date.now();
  pruneExpired(now);
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

export function isFounderUnlimitedEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (FOUNDER_UNLIMITED_EMAILS.has(e)) return true;
  // FOUNDER_EMAILS / OPS_EMAILS env allowlist (ops hire)
  return isOpsUser({ email: e, app_metadata: {} });
}

/**
 * Only founder / ops (and demo bypass) skip freemium.
 * Regular signed-in accounts remain capped.
 */
export async function isFreemiumExempt(req: Request): Promise<boolean> {
  if (isDemoUsageBypassAllowed(req)) return true;
  const user = await resolveAuthUser(req);
  if (!user) return false;
  if (isOpsUser(user)) return true;
  return isFounderUnlimitedEmail(user.email);
}

/** Anonymous IP+UA freemium bucket. */
export function isAnonymousGuestRateLimited(req: Request): boolean {
  return bumpAndLimited(clientKey(req));
}

/** Per-user freemium for signed-in non-founder accounts. */
export function isSignedInFreemiumRateLimited(userId: string): boolean {
  return bumpAndLimited(`user:${userId}`);
}

export function isDemoUsageBypassAllowed(req: Request): boolean {
  const header = String(req.headers["x-lazarus-demo-bypass"] ?? "").trim();
  if (header !== "1") return false;
  const envOn = (process.env.GUEST_USAGE_DEMO_BYPASS ?? "").trim().toLowerCase() === "true";
  const isProd = process.env.NODE_ENV === "production";
  return envOn || !isProd;
}

export function guestServerLimitMessage(): string {
  return `Free analyses are limited for today. Paid plans come next — founder demos use the founder login.`;
}
