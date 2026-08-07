import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { API_BASE, apiAuthHeaders } from "./api";

const viteEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

const url = (viteEnv?.VITE_SUPABASE_URL ?? "").trim();
const anon = (viteEnv?.VITE_SUPABASE_ANON_KEY ?? "").trim();

let client: SupabaseClient | null = null;

export function isAuthConfigured(): boolean {
  return !!(url && anon);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isAuthConfigured()) return null;
  if (!client) {
    client = createClient(url, anon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

export async function fetchAuthStatus(): Promise<{
  configured: boolean;
  note: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/status`);
    if (!res.ok) return { configured: isAuthConfigured(), note: "Auth status unavailable" };
    return res.json() as Promise<{ configured: boolean; note: string }>;
  } catch {
    return { configured: isAuthConfigured(), note: "Auth status unavailable" };
  }
}

export async function signInWithEmail(email: string): Promise<void> {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Auth is not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).");
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithGoogle(): Promise<void> {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Auth is not configured.");
  const { error } = await sb.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
  if (error) throw error;
}

export async function signInWithCrmProvider(
  provider: "hubspot" | "salesforce"
): Promise<{ email: string }> {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Auth is not configured.");

  const res = await fetch(`${API_BASE}/api/auth/session-from-crm`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ provider }),
  });
  const data = (await res.json()) as {
    error?: string;
    email?: string;
    token_hash?: string | null;
    email_otp?: string | null;
  };
  if (!res.ok) throw new Error(data.error ?? "CRM sign-in failed");

  if (data.token_hash) {
    const { error } = await sb.auth.verifyOtp({
      type: "magiclink",
      token_hash: data.token_hash,
    });
    if (error) throw error;
  } else if (data.email_otp && data.email) {
    const { error } = await sb.auth.verifyOtp({
      type: "email",
      email: data.email,
      token: data.email_otp,
    });
    if (error) throw error;
  } else {
    throw new Error("CRM bridge did not return a session token. Check service role key.");
  }

  return { email: data.email ?? "" };
}

export async function signOut(): Promise<void> {
  const sb = getSupabaseBrowserClient();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  const sb = getSupabaseBrowserClient();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

export type { User, Session };
