import type { NextFunction, Request, Response } from "express";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function clientIp(req: Request): string {
  const xf = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim();
  return xf || req.socket.remoteAddress || "unknown";
}

function prune(now: number): void {
  if (buckets.size < 2000) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export function clientRateKey(req: Request, name: string): string {
  return `${name}:${clientIp(req)}`;
}

export function consumeRateLimit(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  prune(now);
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }
  if (bucket.count >= max) return true;
  bucket.count += 1;
  return false;
}

export function rateLimit(opts: {
  windowMs: number;
  max: number;
  name: string;
  skip?: (req: Request) => boolean;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (opts.skip?.(req)) {
      next();
      return;
    }
    const limited = consumeRateLimit(clientRateKey(req, opts.name), opts.windowMs, opts.max);
    if (limited) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "Too many requests. Wait a minute and try again." });
      return;
    }
    next();
  };
}

export function skipPublicAndWebhooks(req: Request): boolean {
  const path = req.path || "";
  return (
    path === "/health" ||
    path.startsWith("/webhooks/") ||
    path === "/billing/webhook" ||
    path === "/runtime" ||
    path.includes("/live-captions")
  );
}
