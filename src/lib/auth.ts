import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { API_BASE, apiAuthHeaders } from "./api";

const viteEnv = (
  import.meta as ImportMeta & {
    env?: Record<string, string | undefined>;
  }
).env;

let runtimeUrl = (viteEnv?.VITE_SUPABASE_URL ?? "").trim();
let runtimeAnon = (viteEnv?.VITE_SUPABASE_ANON_KEY ?? "").trim();
let client: SupabaseClient | null = null;
let configPromise: Promise<boolean> | null = null;

export type LazarusLoginProvider = "google" | "hubspot" | "salesforce";

export function isAuthConfigured(): boolean {
  return !!(runtimeUrl && runtimeAnon);
}

/** Load anon credentials from Vite env or from Render/runtime `/api/auth/public-config`. */
export async function ensureAuthConfig(): Promise<boolean> {
  if (isAuthConfigured()) return true;
  if (configPromise) return configPromise;

  configPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/api/auth/public-config`);
      if (!res.ok) return false;
      const data = (await res.json()) as {
        configured?: boolean;
        supabaseUrl?: string;
        supabaseAnonKey?: string;
      };
      if (!data.configured || !data.supabaseUrl || !data.supabaseAnonKey) return false;
      runtimeUrl = data.supabaseUrl.trim();
      runtimeAnon = data.supabaseAnonKey.trim();
      client = null;
      return isAuthConfigured();
    } catch {
      return false;
    }
  })();

  return configPromise;
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isAuthConfigured()) return null;
  if (!client) {
    client = createClient(runtimeUrl, runtimeAnon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
  }
  return client;
}

async function applySessionFromBridge(data: {
  email?: string;
  token_hash?: string | null;
  email_otp?: string | null;
}): Promise<{ email: string }> {
  await ensureAuthConfig();
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Lazarus login is not configured on this build.");

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
    throw new Error("Sign-in did not return a session. Try again after approving the popup.");
  }

  return { email: data.email ?? "" };
}

export async function fetchAuthStatus(): Promise<{
  configured: boolean;
  google?: boolean;
  hubspot?: boolean;
  salesforce?: boolean;
  email?: boolean;
  note: string;
}> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/status`);
    if (!res.ok) return { configured: isAuthConfigured(), note: "Auth status unavailable" };
    return res.json() as Promise<{
      configured: boolean;
      google?: boolean;
      hubspot?: boolean;
      salesforce?: boolean;
      email?: boolean;
      note: string;
    }>;
  } catch {
    return { configured: isAuthConfigured(), note: "Auth status unavailable" };
  }
}

/** Email magic link — Lazarus branded; no Supabase dashboard required for the user. */
export async function signInWithEmail(email: string): Promise<{
  message: string;
  action_link?: string;
  token_hash?: string;
}> {
  await ensureAuthConfig();
  const res = await fetch(`${API_BASE}/api/auth/email-magic-link`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ email: email.trim() }),
  });
  const data = (await res.json()) as {
    error?: string;
    message?: string;
    action_link?: string;
    token_hash?: string;
  };
  if (!res.ok) throw new Error(data.error ?? "Email sign-in failed");

  if (data.token_hash) {
    await applySessionFromBridge({ email: email.trim(), token_hash: data.token_hash });
  }

  return {
    message: data.message ?? "Check your email for the Lazarus sign-in link.",
    action_link: data.action_link,
    token_hash: data.token_hash,
  };
}

/** @deprecated Prefer Lazarus Google OAuth via signInWithProvider("google"). */
export async function signInWithGoogle(): Promise<void> {
  await signInWithProvider("google");
}

export function providerConnectUrl(provider: LazarusLoginProvider): string {
  if (provider === "google") return `${API_BASE}/api/integrations/google/connect`;
  if (provider === "hubspot") return `${API_BASE}/api/integrations/hubspot/connect`;
  return `${API_BASE}/api/integrations/salesforce/connect`;
}

export function openProviderConnectPopup(provider: LazarusLoginProvider): Window {
  const popup = window.open(
    providerConnectUrl(provider),
    `lazarus-${provider}-login`,
    "popup=yes,width=560,height=720,resizable=yes,scrollbars=yes"
  );
  if (!popup) throw new Error("Allow popups to sign in with " + provider + ".");
  popup.focus();
  return popup;
}

/** Finish Lazarus session after OAuth popup connected Google / HubSpot / Salesforce. */
export async function completeProviderSignIn(
  provider: LazarusLoginProvider
): Promise<{ email: string }> {
  await ensureAuthConfig();
  const res = await fetch(`${API_BASE}/api/auth/session-from-provider`, {
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
  if (!res.ok) throw new Error(data.error ?? "Sign-in failed");
  return applySessionFromBridge(data);
}

/** Alias for CRM bridge naming. */
export async function signInWithCrmProvider(
  provider: "hubspot" | "salesforce" | "google"
): Promise<{ email: string }> {
  return completeProviderSignIn(provider);
}

export async function signInWithProvider(provider: LazarusLoginProvider): Promise<void> {
  openProviderConnectPopup(provider);
}

export async function signOut(): Promise<void> {
  const sb = getSupabaseBrowserClient();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function getSession(): Promise<Session | null> {
  await ensureAuthConfig();
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
