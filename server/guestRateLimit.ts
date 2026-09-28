import crypto from "crypto";
import type { Request } from "express";
import { isOpsUser, resolveAuthUser, serviceRoleClient } from "./founderAuth.js";
import { clientIp } from "./rateLimit.js";

/** Soft freemium so clearing localStorage is not unlimited Gemini use. */

type Bucket = { count: number; resetAt: number };

/** UTC calendar month — wait until next month, not a rolling 24h or 30-day refill. */
function nextUtcMonthStart(from = Date.now()): number {
  const d = new Date(from);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

const buckets = new Map<string, Bucket>();

/** Matches src/lib/guestUsage.ts — advertised free analyses. */
export const GUEST_FREE_CAP = 5;

const FOUNDER_UNLIMITED_EMAILS = new Set(["joshua.bennett003@gmail.com"]);

function envInt(name: string, fallback: number): number {
  const n = Number((process.env[name] ?? "").trim());
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

/** Max unpaid analyses per IP per UTC calendar month (office NAT ceiling). */
export function guestIpMonthlyLimit(): number {
  return envInt("GUEST_IP_MONTHLY_LIMIT", envInt("GUEST_IP_DAILY_LIMIT", 100));
}

/** Founder Ops still reads guest_daily_limit. */
export function guestDailyLimit(): number {
  return guestIpMonthlyLimit();
}

export function guestFreePerIpLimit(): number {
  return envInt("GUEST_FREE_PER_IP", GUEST_FREE_CAP);
}

/** Max $10 pay-per-report runs per IP per UTC calendar month (abuse ceiling). */
export function ppuIpMonthlyLimit(): number {
  return envInt("PPU_IP_MONTHLY_LIMIT", 100);
}

function ipHash(ip: string): string {
  const salt =
    (process.env.OAUTH_STATE_SECRET ?? "").trim() ||
    (process.env.TOKEN_ENCRYPTION_KEY ?? "").trim() ||
    "lazarus-ip-usage";
  return crypto.createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function pruneExpired(now: number): void {
  if (buckets.size < 500) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function memoryState(key: string): { count: number; resetAt: number } {
  const now = Date.now();
  pruneExpired(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: nextUtcMonthStart(now) };
    buckets.set(key, bucket);
  }
  return bucket;
}

function peekMemory(key: string, max: number): boolean {
  return memoryState(key).count >= max;
}

/** Returns true when the slot could not be consumed (already at cap). */
function consumeMemory(key: string, max: number): boolean {
  const bucket = memoryState(key);
  if (bucket.count >= max) return true;
  bucket.count += 1;
  return false;
}

async function readPersisted(
  kind: string,
  ip: string
): Promise<{ count: number; windowEnd: Date; memoryKey: string } | null> {
  const memoryKey = `${kind}:${ip}`;
  if ((process.env.GUEST_LIMIT_MEMORY_ONLY ?? "").trim() === "true") {
    return null;
  }
  const sb = serviceRoleClient();
  if (!sb) return null;

  const hash = ipHash(ip);
  const now = new Date();
  try {
    const { data, error } = await sb
      .from("ip_analysis_usage")
      .select("count, window_end")
      .eq("ip_hash", hash)
      .eq("kind", kind)
      .maybeSingle();
    if (error) {
      console.warn("[guest-limit] persist read failed:", error.message);
      return null;
    }
    const windowEnd = data?.window_end ? new Date(String(data.window_end)) : null;
    const fresh = !data || !windowEnd || windowEnd.getTime() <= now.getTime();
    return {
      count: fresh ? 0 : Number(data.count) || 0,
      windowEnd: fresh ? new Date(nextUtcMonthStart(now.getTime())) : (windowEnd as Date),
      memoryKey,
    };
  } catch (err) {
    console.warn("[guest-limit] persist failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

async function peekPersisted(kind: string, ip: string, max: number): Promise<boolean> {
  const memoryKey = `${kind}:${ip}`;
  const row = await readPersisted(kind, ip);
  if (!row) return peekMemory(memoryKey, max);
  return row.count >= max;
}

/** Returns true when blocked (at cap). Call only after a successful analysis. */
async function consumePersisted(kind: string, ip: string, max: number): Promise<boolean> {
  const memoryKey = `${kind}:${ip}`;
  const row = await readPersisted(kind, ip);
  if (!row) return consumeMemory(memoryKey, max);

  if (row.count >= max) return true;

  const sb = serviceRoleClient();
  if (!sb) return consumeMemory(memoryKey, max);

  const hash = ipHash(ip);
  const now = new Date();
  const { error: writeError } = await sb.from("ip_analysis_usage").upsert(
    {
      ip_hash: hash,
      kind,
      count: row.count + 1,
      window_end: row.windowEnd.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "ip_hash,kind" }
  );
  if (writeError) {
    console.warn("[guest-limit] persist write failed:", writeError.message);
    return consumeMemory(memoryKey, max);
  }
  // Keep memory mirror in sync when persist works.
  const mem = memoryState(memoryKey);
  mem.count = row.count + 1;
  mem.resetAt = row.windowEnd.getTime();
  return false;
}

export function isFounderUnlimitedEmail(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  if (FOUNDER_UNLIMITED_EMAILS.has(e)) return true;
  return isOpsUser({ email: e, app_metadata: {} });
}

export async function isFreemiumExempt(req: Request): Promise<boolean> {
  if (isDemoUsageBypassAllowed(req)) return true;
  const user = await resolveAuthUser(req);
  if (!user) return false;
  if (isOpsUser(user)) return true;
  return isFounderUnlimitedEmail(user.email);
}

/** True when this IP already used its 5 free guest analyses this month. Does not burn a slot. */
export async function isAnonymousGuestRateLimited(req: Request): Promise<boolean> {
  return peekPersisted("guest-free", clientIp(req), guestFreePerIpLimit());
}

/** Consume one guest free slot after a successful analysis. */
export async function consumeAnonymousGuestSlot(req: Request): Promise<boolean> {
  return consumePersisted("guest-free", clientIp(req), guestFreePerIpLimit());
}

/** True when unpaid IP monthly ceiling is hit. Does not burn a slot. */
export async function isIpDailyRateLimited(req: Request): Promise<boolean> {
  return peekPersisted("ip-month", clientIp(req), guestIpMonthlyLimit());
}

/** Consume one unpaid IP monthly slot after a successful analysis. */
export async function consumeIpMonthlySlot(req: Request): Promise<boolean> {
  return consumePersisted("ip-month", clientIp(req), guestIpMonthlyLimit());
}

export function ipDailyLimitMessage(): string {
  return `This network has reached the ${guestIpMonthlyLimit()} analyses / month limit. Access resumes next month, or use a paid plan.`;
}

/** True when PPU IP ceiling is hit. Does not burn a slot. */
export async function isPpuIpRateLimited(req: Request): Promise<boolean> {
  return peekPersisted("ppu-ip", clientIp(req), ppuIpMonthlyLimit());
}

/** Consume one $10 pay-per-report IP slot after a successful analysis. */
export async function consumePpuIpSlot(req: Request): Promise<boolean> {
  return consumePersisted("ppu-ip", clientIp(req), ppuIpMonthlyLimit());
}

export function ppuIpLimitMessage(): string {
  const n = ppuIpMonthlyLimit();
  return `This network has used ${n} pay-per-report analyses this month. At $10 each, a monthly plan is much more cost-effective — Entry is $99/mo for 20 analyses, Team is $499/mo unlimited. Wait until next month, or subscribe.`;
}

export function isDemoUsageBypassAllowed(req: Request): boolean {
  const header = String(req.headers["x-lazarus-demo-bypass"] ?? "").trim();
  if (header !== "1") return false;
  const envOn = (process.env.GUEST_USAGE_DEMO_BYPASS ?? "").trim().toLowerCase() === "true";
  const isProd = process.env.NODE_ENV === "production";
  return envOn || !isProd;
}

export function guestServerLimitMessage(): string {
  return "You’ve used your 5 free analyses this month. Buy a $10 extra report (no account required at checkout), or wait until next month when the free allowance renews. Sign up only if you want to save results.";
}

export function resetGuestRateLimitBuckets(): void {
  buckets.clear();
}
