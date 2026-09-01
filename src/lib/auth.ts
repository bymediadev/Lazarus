import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";
import { API_BASE, apiAuthHeaders } from "./api";
import {
  clearPasswordRecoveryState,
  capturePasswordRecoveryFromUrl,
  markAwaitingPasswordReset,
  markPasswordRecoveryPending,
} from "./passwordRecovery";

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
    // Re-check immediately before PKCE code exchange clears the URL.
    capturePasswordRecoveryFromUrl();
    client = createClient(runtimeUrl, runtimeAnon, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    // Subscribe synchronously — PASSWORD_RECOVERY can fire during URL detection.
    client.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        markPasswordRecoveryPending();
      }
    });
  }
  return client;
}

function requireClient(): SupabaseClient {
  const sb = getSupabaseBrowserClient();
  if (!sb) throw new Error("Lazarus login is not configured on this build.");
  return sb;
}

async function applySessionFromTokens(data: {
  access_token?: string | null;
  refresh_token?: string | null;
  email?: string;
}): Promise<{ email: string }> {
  await ensureAuthConfig();
  const sb = requireClient();
  if (!data.access_token || !data.refresh_token) {
    throw new Error("Sign-in did not return a session. Try again after approving the popup.");
  }
  const { error } = await sb.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });
  if (error) throw error;
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

function assertPassword(password: string): void {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
}

/** Sign in with email + password (Supabase Auth). */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  await ensureAuthConfig();
  assertPassword(password);
  const sb = requireClient();
  const { error } = await sb.auth.signInWithPassword({
    email: email.trim(),
    password,
  });
  if (error) throw error;
}

/**
 * Create Lazarus account with email + password.
 * Confirmation email is required — the session is not minted until the inbox link is used.
 */
export async function signUpWithPassword(email: string, password: string): Promise<void> {
  await ensureAuthConfig();
  assertPassword(password);
  const trimmed = email.trim();

  const res = await fetch(`${API_BASE}/api/auth/signup`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({
      email: trimmed,
      password,
      session_id: (() => {
        try {
          return sessionStorage.getItem("lazarus_checkout_session") || undefined;
        } catch {
          return undefined;
        }
      })(),
    }),
  });
  const data = (await res.json()) as { error?: string; ok?: boolean; message?: string };
  if (!res.ok) throw new Error(data.error ?? "Could not create account");
}

/** Change password for the signed-in user. */
export async function updatePassword(newPassword: string): Promise<void> {
  await ensureAuthConfig();
  assertPassword(newPassword);
  const sb = requireClient();
  const { error } = await sb.auth.updateUser({ password: newPassword });
  if (error) throw error;
  clearPasswordRecoveryState();
}

/** Send password-reset email (requires Supabase mailer / SMTP). */
export async function requestPasswordReset(email: string): Promise<void> {
  await ensureAuthConfig();
  markAwaitingPasswordReset();
  markPasswordRecoveryPending();

  const res = await fetch(`${API_BASE}/api/auth/password-reset`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ email: email.trim() }),
  });
  const data = (await res.json()) as {
    error?: string;
    message?: string;
    emailed?: boolean;
  };

  if (!res.ok) {
    clearPasswordRecoveryState();
    const msg = data.error ?? "Password reset failed";
    if (/rate limit/i.test(msg)) {
      throw new Error(
        "Too many reset emails were sent. Wait about an hour, then try again — or use Google sign-in if that account is linked."
      );
    }
    throw new Error(msg);
  }
}

/** Passwordless email path — inbox only. Never completes a session from JSON. */
export async function signInWithEmail(email: string): Promise<{
  message: string;
  signedIn?: boolean;
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
  };
  if (!res.ok) throw new Error(data.error ?? "Email sign-in failed");
  return {
    message: data.message ?? "Check your email for the Lazarus sign-in link.",
    signedIn: false,
  };
}

export function providerConnectUrl(provider: LazarusLoginProvider): string {
  const slug =
    provider === "google" ? "google" : provider === "hubspot" ? "hubspot" : "salesforce";
  const path = `${API_BASE}/api/integrations/${slug}/connect`;
  const url =
    typeof window !== "undefined"
      ? new URL(path, window.location.origin)
      : new URL(path, "http://localhost:5173");
  if (typeof window !== "undefined") {
    url.searchParams.set("return_origin", window.location.origin);
  }
  url.searchParams.set("return_path", "/login");
  return url.toString();
}

/** Ensure the API is reachable before opening the OAuth popup (avoids blank "refused" tabs). */
export async function assertApiReachableForOAuth(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/health`, { method: "GET" });
    if (!res.ok) {
      throw new Error(`API health check failed (${res.status})`);
    }
  } catch {
    throw new Error(
      "Cannot reach the Lazarus API (connection refused). Run npm run dev so the server is on localhost:3001, then try Google / HubSpot again."
    );
  }
}

export async function openProviderConnectPopup(provider: LazarusLoginProvider): Promise<Window> {
  await assertApiReachableForOAuth();
  const popup = window.open(
    providerConnectUrl(provider),
    `lazarus-${provider}-login`,
    "popup=yes,width=560,height=720,resizable=yes,scrollbars=yes"
  );
  if (!popup) throw new Error("Allow popups to sign in with " + provider + ".");
  popup.focus();
  return popup;
}

export async function completeProviderSignIn(
  loginCode?: string | null
): Promise<{ email: string }> {
  await ensureAuthConfig();
  if (!loginCode?.trim()) {
    throw new Error("That sign-in expired. Approve the popup again.");
  }
  const res = await fetch(`${API_BASE}/api/auth/exchange-login-code`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ login_code: loginCode.trim() }),
  });
  const data = (await res.json()) as {
    error?: string;
    email?: string;
    access_token?: string | null;
    refresh_token?: string | null;
    token_hash?: string | null;
    email_otp?: string | null;
    action_link?: string | null;
  };
  if (!res.ok) throw new Error(data.error ?? "Sign-in failed");
  if (data.token_hash || data.email_otp || data.action_link) {
    throw new Error("Sign-in was rejected — the server returned an email token. Try again.");
  }
  return applySessionFromTokens(data);
}

export async function signInWithCrmProvider(): Promise<{ email: string }> {
  throw new Error("That sign-in expired. Approve the popup again.");
}

export async function signInWithProvider(provider: LazarusLoginProvider): Promise<void> {
  openProviderConnectPopup(provider);
}

export async function signOut(): Promise<void> {
  const sb = getSupabaseBrowserClient();
  if (!sb) return;
  await sb.auth.signOut();
}

export async function deleteOwnAccount(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/delete-account`, {
    method: "POST",
    headers: apiAuthHeaders(true),
    body: JSON.stringify({ confirm: "DELETE" }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Could not delete account (${res.status})`);
  }
  await signOut();
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
