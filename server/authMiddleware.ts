import type { Request } from "express";
import { createClient } from "@supabase/supabase-js";

/** Resolve Supabase user id from Authorization: Bearer <access_token> when Auth is configured. */
export async function optionalAuthUserId(req: Request): Promise<string | null> {
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
    return data.user.id;
  } catch {
    return null;
  }
}

export function isSupabaseAuthConfigured(): boolean {
  return !!(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim());
}
