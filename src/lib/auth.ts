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

async function applySessionFromBridge(data: {
  email?: string;
  token_hash?: string | null;
  email_otp?: string | null;
}): Promise<{ email: string }> {
  await ensureAuthConfig();
  const sb = requireClient();

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
 * Uses server admin create (email pre-confirmed) so signup works without SMTP,
 * then signs in with the password.
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
  const data = (await res.json()) as { error?: string; ok?: boolean };
  if (!res.ok) throw new Error(data.error ?? "Could not create account");

  await signInWithPassword(trimmed, password);
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
    token_hash?: string | null;
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

  // Prefer in-app recovery (bypasses inbox rate limits) when the server minted a token.
  if (data.token_hash) {
    const sb = requireClient();
    const { error } = await sb.auth.verifyOtp({
      type: "recovery",
      token_hash: data.token_hash,
    });
    if (error) {
      clearPasswordRecoveryState();
      throw error;
    }
    markPasswordRecoveryPending();
    return;
  }

  // Email-only path (no token returned).
  if (!data.emailed) {
    clearPasswordRecoveryState();
    throw new Error(
      data.message ??
        "Could not start password reset. Check that the API has SUPABASE_SERVICE_ROLE_KEY, then try again."
    );
  }
}

/** Legacy passwordless email path (kept for OAuth-adjacent flows). */
export async function signInWithEmail(email: string): Promise<{
  message: string;
  action_link?: string;
  token_hash?: string;
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
    action_link?: string;
    token_hash?: string | null;
    email_otp?: string | null;
  };
  if (!res.ok) throw new Error(data.error ?? "Email sign-in failed");

  let signedIn = false;
  if (data.token_hash) {
    await applySessionFromBridge({ email: email.trim(), token_hash: data.token_hash });
    signedIn = true;
  } else if (data.email_otp) {
    await applySessionFromBridge({
      email: email.trim(),
      email_otp: data.email_otp,
    });
    signedIn = true;
  }

  return {
    message:
      data.message ?? (signedIn ? "Signed in." : "Check your email for the Lazarus sign-in link."),
    action_link: data.action_link,
    token_hash: data.token_hash ?? undefined,
    signedIn,
  };
}

export function providerConnectUrl(provider: LazarusLoginProvider): string {
  if (provider === "google") return `${API_BASE}/api/integrations/google/connect`;
  if (provider === "hubspot") return `${API_BASE}/api/integrations/hubspot/connect`;
  return `${API_BASE}/api/integrations/salesforce/connect`;
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
