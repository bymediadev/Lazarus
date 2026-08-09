import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "crypto";
import { optionalAuthUserId } from "./authMiddleware.js";
import { serviceRoleClient } from "./founderAuth.js";

const TRACKED_PREFIXES = [
  "/api/post-mortem",
  "/api/live-triage",
  "/api/live-objection",
  "/api/guide",
  "/api/auth",
  "/api/integrations",
];

function shouldTrack(path: string): boolean {
  if (path.startsWith("/api/founder")) return false;
  if (path === "/api/health") return false;
  return TRACKED_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

function shortenError(message: unknown): string | null {
  if (typeof message !== "string" || !message.trim()) return null;
  return message.replace(/\s+/g, " ").trim().slice(0, 160);
}

export async function recordApiEvent(input: {
  requestId: string;
  route: string;
  method: string;
  statusCode: number;
  durationMs: number;
  userId?: string | null;
  errorCode?: string | null;
}): Promise<void> {
  const supabase = serviceRoleClient();
  if (!supabase) return;
  try {
    const { error } = await supabase.from("api_events").insert({
      request_id: input.requestId,
      route: input.route.slice(0, 200),
      method: input.method.slice(0, 16),
      status_code: input.statusCode,
      duration_ms: input.durationMs,
      user_id: input.userId ?? null,
      error_code: input.errorCode ?? null,
    });
    if (error) {
      console.warn("[api_events] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[api_events]", err instanceof Error ? err.message : err);
  }
}

/** Attach request_id and persist api_events for critical routes. */
export function apiEventsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = randomUUID();
  (req as Request & { requestId?: string }).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  if (!shouldTrack(req.path)) {
    next();
    return;
  }

  const started = Date.now();
  let logged = false;

  const finish = async () => {
    if (logged) return;
    logged = true;
    const durationMs = Date.now() - started;
    const userId = await optionalAuthUserId(req);
    let errorCode: string | null = null;
    if (res.statusCode >= 400) {
      const body = (res as Response & { locals?: { apiError?: string } }).locals?.apiError;
      errorCode = shortenError(body) ?? `http_${res.statusCode}`;
    }
    await recordApiEvent({
      requestId,
      route: req.path,
      method: req.method,
      statusCode: res.statusCode,
      durationMs,
      userId,
      errorCode,
    });
  };

  res.on("finish", () => {
    void finish();
  });
  res.on("close", () => {
    void finish();
  });

  next();
}

export function setApiErrorLocal(res: Response, message: string): void {
  if (!res.locals) (res as Response & { locals: Record<string, unknown> }).locals = {};
  res.locals.apiError = message;
}

export function getRequestId(req: Request): string | null {
  return (req as Request & { requestId?: string }).requestId ?? null;
}
