import type { Request, Response, NextFunction } from "express";
import { createClient, type User } from "@supabase/supabase-js";

export type OpsUser = {
  id: string;
  email: string | null;
  role: string | null;
};

function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function opsEmailAllowlist(): Set<string> {
  const a = parseEmailList(process.env.FOUNDER_EMAILS);
  const b = parseEmailList(process.env.OPS_EMAILS);
  return new Set([...a, ...b]);
}

export function alertEmailAllowlist(): string[] {
  const fromAlerts = parseEmailList(process.env.FOUNDER_ALERT_EMAILS);
  if (fromAlerts.size > 0) return [...fromAlerts];
  return [...opsEmailAllowlist()];
}

export function isOpsUser(user: Pick<User, "email" | "app_metadata"> | null | undefined): boolean {
  if (!user) return false;
  const role = String(user.app_metadata?.role ?? "").toLowerCase();
  if (role === "founder" || role === "ops") return true;
  const email = (user.email ?? "").trim().toLowerCase();
  if (!email) return false;
  return opsEmailAllowlist().has(email);
}

export async function resolveAuthUser(req: Request): Promise<User | null> {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const anon = (process.env.SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !anon) return null;

  const header = req.headers.authorization?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  if (!token) return null;

  try {
    const supabase = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

export function serviceRoleClient() {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function requireOps(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  void (async () => {
    const user = await resolveAuthUser(req);
    if (!user || !isOpsUser(user)) {
      res.status(403).json({ error: "Forbidden — ops access required" });
      return;
    }
    (req as Request & { opsUser?: OpsUser }).opsUser = {
      id: user.id,
      email: user.email ?? null,
      role: String(user.app_metadata?.role ?? null),
    };
    next();
  })().catch(next);
}

export function getOpsUser(req: Request): OpsUser | null {
  return (req as Request & { opsUser?: OpsUser }).opsUser ?? null;
}

export function cronSecretOk(req: Request): boolean {
  const secret = (process.env.PURGE_CRON_SECRET ?? process.env.FOUNDER_ALERT_CRON_SECRET ?? "").trim();
  if (!secret) return false;
  return req.headers["x-cron-secret"] === secret;
}
