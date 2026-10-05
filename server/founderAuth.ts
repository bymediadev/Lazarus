import type { Request, Response, NextFunction } from "express";
import { createClient, type User } from "@supabase/supabase-js";
import { secretsEqual } from "./cryptoSecrets.js";

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
  return role === "founder" || role === "ops";
}

/** Read `aal` from a bearer token that `getUser` already accepted. */
export function accessTokenAal(token: string | null | undefined): string | null {
  const part = String(token ?? "").split(".")[1];
  if (!part) return null;
  try {
    const json = JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as { aal?: unknown };
    return typeof json.aal === "string" ? json.aal : null;
  } catch {
    return null;
  }
}

export function bearerTokenFrom(req: Request): string | null {
  const header = req.headers.authorization?.trim() ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
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
    if (accessTokenAal(bearerTokenFrom(req)) !== "aal2") {
      res.status(403).json({
        error: "Ops access requires MFA. Enroll an authenticator, sign in again, then retry.",
        code: "MFA_REQUIRED",
      });
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
  const secret = (process.env.FOUNDER_ALERT_CRON_SECRET ?? "").trim();
  if (!secret) return false;
  const provided = (req.headers["x-cron-secret"] as string | undefined)?.trim();
  return secretsEqual(provided, secret);
}

/** Anon key + the caller's bearer, so RLS applies to customer reads. */
export function userScopedClient(accessToken: string) {
  const url = (process.env.SUPABASE_URL ?? "").trim();
  const anon = (process.env.SUPABASE_ANON_KEY ?? "").trim();
  const token = accessToken.trim();
  if (!url || !anon || !token) return null;
  return createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
