import type { Express, Request } from "express";
import { optionalAuthUserId } from "./authMiddleware.js";
import { serviceRoleClient } from "./founderAuth.js";

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const HOUR_MS = 60 * 60 * 1000;
const HOUR_CAP = 12;

function clientKey(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  const ip = xf || req.socket.remoteAddress || "unknown";
  return `crash:${ip}`;
}

function overHourlyCap(req: Request): boolean {
  const now = Date.now();
  const key = clientKey(req);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + HOUR_MS };
    buckets.set(key, bucket);
  }
  if (bucket.count >= HOUR_CAP) return true;
  bucket.count += 1;
  return false;
}

function clip(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const t = value.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.slice(0, max);
}

export function registerTelemetryRoutes(app: Express): void {
  app.post("/api/telemetry/crash", async (req, res) => {
    if (overHourlyCap(req)) {
      res.status(204).end();
      return;
    }

    const message = clip(req.body?.message, 400) ?? "Client error";
    const stack = clip(req.body?.stack, 4000);
    const pageUrl = clip(req.body?.url ?? req.body?.page_url, 400);
    const userAgent = clip(req.headers["user-agent"], 180);
    const releaseSha = clip(req.body?.release, 40);

    const supabase = serviceRoleClient();
    if (!supabase) {
      res.status(204).end();
      return;
    }

    const userId = await optionalAuthUserId(req);
    const { error } = await supabase.from("client_crashes").insert({
      message,
      stack,
      page_url: pageUrl,
      user_agent: userAgent,
      release_sha: releaseSha,
      user_id: userId,
    });
    if (error) {
      console.warn("[client_crashes]", error.message);
    }
    res.status(204).end();
  });
}
